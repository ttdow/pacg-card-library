/* Text versions are presentation copies; the archived record stays intact. */
(function (root) {
  'use strict';
  function hasErrata(card) {
    const history = card.text_history;
    return Boolean(history?.patches?.length || history?.changes?.some(change =>
      !change.superseded && ['erratum','optional','wiki_note'].includes(change.kind) &&
      (change.instruction || change.fragments?.length)));
  }
  function select(card, mode = 'original') {
    const history = card.text_history || {changes:[],patches:[]};
    const displayed = JSON.parse(JSON.stringify(card));
    let applied = 0, missed = 0;
    const apply = patches => {
      for (const patch of patches || []) {
        let target = displayed;
        const path = patch.path || [];
        if (!path.length || path.some(key => ['__proto__','constructor','prototype'].includes(key))) { missed++; continue; }
        for (const key of path.slice(0,-1)) target = target?.[key];
        const key = path[path.length-1];
        if (target && Object.hasOwn(target,key) && JSON.stringify(target[key]) === JSON.stringify(patch.before)) {
          target[key] = JSON.parse(JSON.stringify(patch.after)); applied++;
        } else missed++;
      }
    };
    if (mode !== 'errata') {
      if (history.original_verified && history.original) Object.assign(displayed,history.original);
      else { apply(history.original_patches); apply(history.original_mask_patches); }
      return {card:displayed,applied,missed,note:card.unresolved ? 'Card text is not yet available.' : missed
        ? 'Some original passages need source review; the archived wording could not receive a stale reconstruction.'
        : history.original_verified && history.original
        ? 'Verified printed wording.' : history.original_mask_patches?.length
        ? 'Earlier wording is not established for some passages; those passages are withheld from Original. Available corrections are shown in Errata.'
        : history.original_patches?.length
        ? 'Pre-errata passages reconstructed from explicit Paizo instructions. The complete physical printing is unverified.'
        : 'Original printing unverified. Wiki transcription shown; it may already include errata.'};
    }
    apply(history.patches);
    const official = (history.changes || []).filter(change => change.kind === 'erratum' && !change.superseded);
    return {card:displayed,applied,missed,note:missed ? 'Some updates need source review. See changes & clarifications.' : applied
      ? 'Official errata applied to the wiki transcription.' : official.length
        ? 'Wiki transcription with official errata notes. Unresolved wording differences are listed below.'
        : 'Wiki transcription shown. No mandatory official errata are recorded for this version.'};
  }

  function node(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text != null) value.textContent = String(text);
    return value;
  }
  function paragraph(parent, title, text) {
    if (!text) return;
    const block = node('div','history-passage');
    block.append(node('h4','',title),node('p','',text));
    parent.append(block);
  }
  function disclosure(card) {
    const outer = node('details','history-disclosure');
    const changes = card.text_history?.changes || [];
    outer.append(node('summary','','Changes & clarifications' + (changes.length ? ` · ${changes.length}` : '')));
    const body = node('div','history-body');
    const audit = card.text_history?.original_audit;
    if (audit) {
      if (audit.restored_passages) body.append(node('p','source-note','Original passages are reconstructed from Paizo’s explicit pre-errata wording; the complete physical printing has not been verified.'));
      if (audit.unavailable_passages) body.append(node('p','source-note','Some original passages are not established by the retained sources and are withheld from Original. Their available corrected text remains in Errata.'));
      else if (audit.needs_source_review) body.append(node('p','source-note','Some original wording or printed metadata still needs source verification.'));
    }
    if (!changes.length) body.append(node('p','source-note','No changes or clarifications are recorded for this card.'));
    for (const change of changes) {
      const details = node('details','errata');
      details.append(node('summary','',change.question || 'View change'));
      const kind = change.superseded ? 'Superseded errata' : {erratum:'Official errata',optional:'Optional change',clarification:'Clarification',wiki_note:'Wiki note'}[change.kind] || 'Source note';
      const metadata = node('p','history-meta',kind + (change.date ? ` · FAQ date ${change.date}` : ''));
      if (change.source_url && /^https:\/\/(?:paizo\.com|pacg\.fandom\.com)\//.test(change.source_url)) {
        const link = node('a','',change.kind === 'wiki_note' ? 'Wiki source ↗' : 'Official source ↗');
        link.href = change.source_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        metadata.append(document.createTextNode(' · '),link);
      }
      details.append(metadata);
      if (change.kind === 'optional') details.append(node('p','source-note','Optional; this change is not applied automatically.'));
      paragraph(details,'Clarification',change.explanation);
      paragraph(details,'Previous wording (source excerpt)',change.original_fragment);
      for (const fragment of change.fragments || []) {
        paragraph(details,'Previous wording (FAQ excerpt)',fragment.old);
        paragraph(details,fragment.kind === 'remove_trait' ? 'Trait to remove' : fragment.kind === 'add_trait' ? 'Trait to add' : 'Errata wording (FAQ excerpt)',fragment.expected);
      }
      paragraph(details,'Source instruction',change.instruction);
      paragraph(details,'Comparison note',change.review_note);
      body.append(details);
    }
    outer.append(body);
    return outer;
  }
  const api = {select,disclosure,hasErrata};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PACGHistory = api;
})(typeof window !== 'undefined' ? window : globalThis);
