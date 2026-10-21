/* Private, account-free feedback through the maintainer's public Formspree endpoint. */
(function (root) {
  'use strict';
  const ENDPOINT = 'https://formspree.io/f/mdearzvq';
  function feedbackPayload({message, page = '', view = ''}) {
    const text = String(message || '').trim();
    if (!text) throw new Error('Please enter a message.');
    if (text.length > 2000) throw new Error('Please keep your message to 2,000 characters or fewer.');
    // The receiving form requires type even though visitors no longer choose one.
    const payload = {type:'feedback',message:text,_subject:'PACG Library — Feedback'};
    if (page) {
      payload.page = String(page);
      if (view) payload.view = String(view).slice(0,200);
    }
    return payload;
  }
  async function sendFeedback(values, request = (...args) => root.fetch(...args)) {
    const payload = feedbackPayload(values);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),20000);
    try {
      let response;
      try {
        response = await request(ENDPOINT,{method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',
          headers:{Accept:'application/json','Content-Type':'application/json'},
          body:JSON.stringify(payload),signal:controller.signal});
      } catch {
        throw new Error('Couldn’t confirm your submission. Please check your connection and try again later.');
      }
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true) {
        const labels = {type:'Feedback type',message:'Message',email:'Email'};
        const errors = Array.isArray(data?.errors) ? data.errors.map(error => {
          if (typeof error?.message !== 'string') return '';
          const field = typeof error.field === 'string' ? error.field : '';
          return field ? `${labels[field] || field}: ${error.message}` : error.message;
        }).filter(Boolean).join(' ') : '';
        throw new Error(errors || 'Feedback is temporarily unavailable. Your message is still here; please try again later.');
      }
    } finally { clearTimeout(timeout); }
  }
  function initialize() {
    const opener = document.getElementById('feedback-open');
    if (!opener) return;
    const node = (tag,className,text) => {
      const value = document.createElement(tag);
      if (className) value.className = className;
      if (text != null) value.textContent = text;
      return value;
    };
    const dialog = node('dialog','feedback-dialog');
    dialog.id = 'feedback-dialog';
    dialog.setAttribute('aria-labelledby','feedback-title');
    dialog.setAttribute('aria-describedby','feedback-delivery-note');
    const heading = node('div','feedback-heading');
    const title = node('h2','','Report a bug or suggestion');
    title.id = 'feedback-title';
    const close = node('button','feedback-close','×');
    close.type = 'button';
    close.setAttribute('aria-label','Close feedback');
    close.addEventListener('click',() => dialog.close());
    heading.append(title,close);
    const form = node('form','feedback-form');
    const messageLabel = node('label','feedback-field','Message');
    const message = node('textarea');
    message.id = 'feedback-message';
    message.name = 'message';
    message.rows = 7;
    message.maxLength = 2000;
    message.required = true;
    message.placeholder = 'Describe what happened or what you would like to see…';
    messageLabel.append(message);
    const includeLabel = node('label','feedback-context');
    const includePage = node('input');
    includePage.type = 'checkbox';
    includePage.id = 'feedback-include-page';
    includePage.defaultChecked = true;
    includeLabel.append(includePage,node('span','','Include a link to this page'));
    const note = node('p','feedback-note','Your message is sent privately through Formspree to the project maintainer. No account required.');
    note.id = 'feedback-delivery-note';
    const error = node('p','feedback-error');
    error.setAttribute('role','alert');
    error.hidden = true;
    const success = node('p','feedback-success');
    success.setAttribute('role','status');
    success.tabIndex = -1;
    success.hidden = true;
    const actions = node('div','feedback-actions');
    const cancel = node('button','feedback-cancel','Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click',() => dialog.close());
    const submit = node('button','feedback-submit','Send message');
    submit.type = 'submit';
    actions.append(cancel,submit);
    form.append(messageLabel,includeLabel,note,error,success,actions);
    dialog.append(heading,form);
    document.body.append(dialog);
    opener.addEventListener('click',() => {
      dialog.showModal();
      (message.disabled ? close : message).focus();
    });
    dialog.addEventListener('close',() => opener.focus({preventScroll:true}));
    dialog.addEventListener('click',event => {
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
    });
    const clearNotices = () => { error.hidden = true; success.hidden = true; };
    message.addEventListener('input',clearNotices);
    includePage.addEventListener('change',clearNotices);
    let sending = false;
    form.addEventListener('submit',async event => {
      event.preventDefault();
      if (sending) return;
      clearNotices();
      const values = {message:message.value,page:includePage.checked ? location.href : '',view:document.title};
      try {
        feedbackPayload(values);
        sending = true;
        form.setAttribute('aria-busy','true');
        for (const field of [message,includePage,submit]) field.disabled = true;
        submit.textContent = 'Sending…';
        cancel.textContent = 'Close';
        await sendFeedback(values);
        form.reset();
        success.textContent = 'Thank you—your message has been submitted.';
        success.hidden = false;
        if (dialog.open) success.focus({preventScroll:true});
      } catch (failure) {
        error.textContent = failure.message;
        error.hidden = false;
      } finally {
        sending = false;
        form.setAttribute('aria-busy','false');
        for (const field of [message,includePage,submit]) field.disabled = false;
        submit.textContent = 'Send message';
        cancel.textContent = 'Cancel';
        if (!error.hidden && dialog.open) message.focus();
      }
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {ENDPOINT,feedbackPayload,sendFeedback};
  else { root.PACGFeedback = {ENDPOINT,feedbackPayload,sendFeedback}; initialize(); }
})(typeof window !== 'undefined' ? window : globalThis);
