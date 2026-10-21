/* Shared data interface: SQLite HTTP API or immutable static JSON snapshot. */
(function (root) {
  'use strict';
  const asciiLower = value => String(value).replace(/[A-Z]/g, c => c.toLowerCase());
  const normalize = value => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  class SearchIndex {
    constructor(data) {
      if (data.schema_version !== 1) throw new Error('Unsupported static index version.');
      this.data = data;
      this.words = Object.keys(data.terms).sort();
      this.ids = new Set(data.records.map(r => r.id));
    }

    prefix(prefix) {
      let low = 0, high = this.words.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (this.words[mid] < prefix) low = mid + 1;
        else high = mid;
      }
      const result = new Set();
      for (let i = low; i < this.words.length && this.words[i].startsWith(prefix); i++) {
        for (const position of this.data.terms[this.words[i]]) result.add(position);
      }
      return result;
    }

    search(params = new URLSearchParams()) {
      const value = (key, fallback = '') => (params.get(key) ?? fallback).trim();
      const query = value('q');
      if (query.length > 200) throw new Error('Search must be 200 characters or fewer.');
      const mode = value('mode', 'text');
      if (!['name','text','prefix'].includes(mode)) throw new Error('Unknown search mode.');
      const status = value('status');
      if (!['','review','incomplete'].includes(status)) throw new Error('Unknown text status filter.');
      const integer = (key, fallback, maximum) => {
        const raw = value(key, fallback);
        if (!/^[+-]?\d+$/.test(raw)) throw new Error('Page and limit must be numbers.');
        return Math.max(1, Math.min(Number(raw), maximum));
      };
      let page = integer('page', '1', 100000);
      let limit = integer('limit', '40', 100);
      const nameQuery = asciiLower(query);
      const tokens = query.match(/[\p{L}\p{N}_]+/gu)?.slice(0,12) || [];
      let matches = null;
      if (query && mode === 'text' && tokens.length) {
        for (const token of tokens) {
          const found = this.prefix(normalize(token));
          matches = matches === null ? found : new Set([...matches].filter(i => found.has(i)));
          if (!matches.size) break;
        }
      }
      const ranks = [[],[],[]];
      this.data.records.forEach((record, i) => {
        const name = asciiLower(record.name);
        if (query && (mode === 'prefix' ? !name.startsWith(nameQuery) :
          !name.includes(nameQuery) && (mode === 'name' || record.unresolved || !matches?.has(i)))) return;
        if (value('type') && record.card_type !== value('type')) return;
        if (value('product') && !record._products.includes(value('product'))) return;
        if (value('family') && !record._families.includes(value('family'))) return;
        if (status === 'review' && ['wiki_transcription','printed_verified'].includes(record.text_status)) return;
        if (status === 'incomplete' && !['missing','wiki_partial','token_identity_only'].includes(record.text_status)) return;
        ranks[name === nameQuery ? 0 : name.startsWith(nameQuery) ? 1 : 2].push(record);
      });
      const ordered = ranks.flat();
      const total = ordered.length;
      if (value('all') === '1') { page = 1; limit = Math.max(1, total); }
      const pages = Math.max(1, Math.ceil(total / limit));
      page = Math.min(page, pages);
      const cards = ordered.slice((page - 1) * limit, page * limit).map(record => {
        const {_products, _families, ...summary} = record;
        return summary;
      });
      return {cards, total, page, pages, limit};
    }
  }

  async function readJSON(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `The request failed (${response.status}).`);
    }
    return response.json();
  }

  function abortError() { return new DOMException('Request aborted.', 'AbortError'); }
  function withSignal(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const abort = () => reject(abortError());
      signal.addEventListener('abort', abort, {once:true});
      promise.then(resolve,reject).finally(() => signal.removeEventListener('abort',abort));
    });
  }

  class SQLiteSource {
    constructor(base) { this.base = base; }
    meta(signal) { return readJSON(new URL('api/meta',this.base), {signal}); }
    search(params, signal) { return readJSON(new URL('api/cards?' + params,this.base), {signal}); }
    detail(id, signal) { return readJSON(new URL('api/cards/' + encodeURIComponent(id),this.base), {signal}); }
  }

  class StaticSource {
    constructor(base) {
      this.base = base;
      this.pending = null;
      this.cards = new Map();
    }
    load() {
      if (!this.pending) {
        this.pending = (async () => {
          const manifest = await readJSON(new URL('data/manifest.json',this.base), {cache:'no-store'});
          if (manifest.schema_version !== 1 || !/^[a-f0-9]{20}$/.test(manifest.release)) throw new Error('Unsupported static manifest.');
          const release = new URL('data/' + manifest.release + '/',this.base);
          const data = await readJSON(new URL('index.json',release));
          return {index:new SearchIndex(data), release};
        })().catch(error => { this.pending = null; throw error; });
      }
      return this.pending;
    }
    async meta(signal) { return (await withSignal(this.load(),signal)).index.data.meta; }
    async search(params, signal) {
      const {index} = await withSignal(this.load(),signal);
      if (signal?.aborted) throw abortError();
      return index.search(params);
    }
    async detail(id, signal) {
      const {index, release} = await withSignal(this.load(),signal);
      if (!index.ids.has(id)) throw new Error('Card not found.');
      if (signal?.aborted) throw abortError();
      if (!this.cards.has(id)) {
        const pending = readJSON(new URL('cards/' + encodeURIComponent(id) + '.json',release))
          .catch(error => { this.cards.delete(id); throw error; });
        this.cards.set(id,pending);
      }
      return withSignal(this.cards.get(id),signal);
    }
  }

  function create({mode = 'sqlite', base}) {
    const directory = new URL('./',base);
    if (mode === 'static') return new StaticSource(directory);
    if (mode === 'sqlite') return new SQLiteSource(directory);
    throw new Error('Unknown library data mode.');
  }
  const api = {create, SearchIndex, StaticSource, SQLiteSource};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PACGData = api;
})(typeof window !== 'undefined' ? window : globalThis);
