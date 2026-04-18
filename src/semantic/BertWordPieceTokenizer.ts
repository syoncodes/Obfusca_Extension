/**
 * BertWordPieceTokenizer — lightweight browser-side WordPiece tokenizer
 * for BERT-base-uncased NER inference.
 *
 * Loads vocab from the `vocab.txt` file bundled with the model.
 * Implements the NERTokenizer interface required by ONNXSemanticDetector.
 *
 * This is a minimal implementation sufficient for inference. It handles:
 *  - Unicode normalization (NFD → strip accents → lowercase)
 *  - Whitespace + punctuation pre-tokenization
 *  - WordPiece sub-word tokenization with ## prefix
 *  - [CLS] / [SEP] special token insertion
 *  - Truncation to max_length
 *  - Offset mapping for character-level span recovery
 *
 * For production, consider using @huggingface/transformers which loads
 * tokenizer.json natively. This standalone implementation avoids the
 * 2MB+ dependency for the minimal NER use case.
 */

import type { NERTokenizer } from './ONNXSemanticDetector';

// ---------------------------------------------------------------------------
// Special token IDs (BERT-base-uncased)
// ---------------------------------------------------------------------------


const UNK_TOKEN = '[UNK]';
const CLS_TOKEN = '[CLS]';
const SEP_TOKEN = '[SEP]';

// ---------------------------------------------------------------------------
// BertWordPieceTokenizer
// ---------------------------------------------------------------------------

export class BertWordPieceTokenizer implements NERTokenizer {
  private readonly vocab: Map<string, number>;
  private readonly unkId: number;
  private readonly clsId: number;
  private readonly sepId: number;
  private readonly maxWordLen = 100;

  /**
   * Create from a vocab string (contents of vocab.txt, one token per line).
   */
  constructor(vocabText: string) {
    this.vocab = new Map();
    const lines = vocabText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const token = lines[i].trimEnd();
      if (token.length > 0) {
        this.vocab.set(token, i);
      }
    }

    this.unkId = this.vocab.get(UNK_TOKEN) ?? 100;
    this.clsId = this.vocab.get(CLS_TOKEN) ?? 101;
    this.sepId = this.vocab.get(SEP_TOKEN) ?? 102;
  }

  /**
   * Create from a fetch response (downloads vocab.txt from the model bundle).
   */
  static async fromUrl(url: string): Promise<BertWordPieceTokenizer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch vocab: HTTP ${response.status}`);
    const text = await response.text();
    return new BertWordPieceTokenizer(text);
  }

  /**
   * Create from IndexedDB or chrome.storage where vocab was cached.
   */
  static fromVocabString(vocabText: string): BertWordPieceTokenizer {
    return new BertWordPieceTokenizer(vocabText);
  }

  // -----------------------------------------------------------------------
  // NERTokenizer interface
  // -----------------------------------------------------------------------

  encode(
    text: string,
    maxLength: number = 512,
  ): {
    input_ids: number[];
    attention_mask: number[];
    offset_mapping: Array<[number, number]>;
  } {
    // Pre-tokenize into words with character offsets
    const words = this._preTokenize(text);

    // WordPiece tokenize each word, tracking offsets
    const tokenIds: number[] = [this.clsId];
    const offsets: Array<[number, number]> = [[0, 0]]; // CLS token

    // Reserve 2 slots for [CLS] and [SEP]
    const maxTokens = maxLength - 2;

    for (const { word, start, end } of words) {
      const subTokens = this._wordPieceTokenize(word);
      
      for (const sub of subTokens) {
        if (tokenIds.length - 1 >= maxTokens) break; // -1 for CLS already added

        const tokenId = this.vocab.get(sub) ?? this.unkId;
        tokenIds.push(tokenId);

        // For sub-word tokens (##...), map to the parent word's character range
        // The first sub-token gets the exact start; continuations extend end
        offsets.push([start, end]);
      }

      if (tokenIds.length - 1 >= maxTokens) break;
    }

    // Add [SEP]
    tokenIds.push(this.sepId);
    offsets.push([0, 0]); // SEP token

    const seqLen = tokenIds.length;
    const attention_mask = new Array(seqLen).fill(1);

    return {
      input_ids: tokenIds,
      attention_mask,
      offset_mapping: offsets,
    };
  }

  // -----------------------------------------------------------------------
  // Private: pre-tokenization
  // -----------------------------------------------------------------------

  /**
   * Split text into words at whitespace and punctuation boundaries.
   * Returns words with their character offsets in the original text.
   *
   * Applies BERT normalization:
   *  - Strip accents
   *  - Lowercase
   *  - Insert whitespace around CJK characters and punctuation
   */
  private _preTokenize(
    text: string,
  ): Array<{ word: string; start: number; end: number }> {
    const result: Array<{ word: string; start: number; end: number }> = [];

    let i = 0;
    while (i < text.length) {
      // Skip whitespace
      while (i < text.length && this._isWhitespace(text.charCodeAt(i))) {
        i++;
      }
      if (i >= text.length) break;

      const wordStart = i;

      // Check if punctuation (single-char token)
      if (this._isPunctuation(text.charCodeAt(i))) {
        const ch = text[i].toLowerCase();
        result.push({ word: ch, start: i, end: i + 1 });
        i++;
        continue;
      }

      // Accumulate word characters
      while (
        i < text.length &&
        !this._isWhitespace(text.charCodeAt(i)) &&
        !this._isPunctuation(text.charCodeAt(i))
      ) {
        i++;
      }

      if (i > wordStart) {
        // Normalize: lowercase, strip accents
        const raw = text.slice(wordStart, i);
        const normalized = this._normalize(raw);
        result.push({ word: normalized, start: wordStart, end: i });
      }
    }

    return result;
  }

  /**
   * Normalize a word: NFD decomposition, strip combining marks (accents),
   * lowercase.
   */
  private _normalize(word: string): string {
    // NFD decompose then strip combining diacritical marks
    return word
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  // -----------------------------------------------------------------------
  // Private: WordPiece tokenization
  // -----------------------------------------------------------------------

  /**
   * Tokenize a single word into WordPiece sub-tokens.
   * Returns array of token strings (first token is bare, rest have ## prefix).
   *
   * If the word is too long or entirely unknown, returns [UNK_TOKEN].
   */
  private _wordPieceTokenize(word: string): string[] {
    if (word.length > this.maxWordLen) {
      return [UNK_TOKEN];
    }

    const tokens: string[] = [];
    let start = 0;
    let isFirst = true;

    while (start < word.length) {
      let end = word.length;
      let found: string | null = null;

      // Greedy longest-match from start
      while (start < end) {
        const substr = word.slice(start, end);
        const candidate = isFirst ? substr : `##${substr}`;

        if (this.vocab.has(candidate)) {
          found = candidate;
          break;
        }
        end--;
      }

      if (!found) {
        // Character not in vocab at all
        return [UNK_TOKEN];
      }

      tokens.push(found);
      start = end;
      isFirst = false;
    }

    return tokens;
  }

  // -----------------------------------------------------------------------
  // Character classification helpers
  // -----------------------------------------------------------------------

  private _isWhitespace(cp: number): boolean {
    // Space, tab, newline, carriage return, and Unicode Zs category basics
    return (
      cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d ||
      cp === 0xa0 || cp === 0x3000
    );
  }

  private _isPunctuation(cp: number): boolean {
    // ASCII punctuation ranges
    if (
      (cp >= 33 && cp <= 47) ||   // ! " # $ % & ' ( ) * + , - . /
      (cp >= 58 && cp <= 64) ||   // : ; < = > ? @
      (cp >= 91 && cp <= 96) ||   // [ \ ] ^ _ `
      (cp >= 123 && cp <= 126)    // { | } ~
    ) {
      return true;
    }
    // Unicode General Punctuation block (subset)
    if (cp >= 0x2000 && cp <= 0x206f) return true;
    return false;
  }
}
