/* ---------- contact ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COPY_LABEL = '[ copy ]';
const COPY_RESET_MS = 1500;

const MSG_INVALID = 'that address is missing a part. usually the part after the @.';
const MSG_RECEIVED = 'received. we will write when the next thing comes off the line, and not before.';

export function initContact(): void {
  initForm();
  initCopyButton();
}

function initForm(): void {
  const form = document.getElementById('form');
  const email = document.getElementById('email');
  const log = document.getElementById('out');
  if (!form || !(email instanceof HTMLInputElement) || !log) return;

  // clicking anywhere on the prompt line focuses the input
  form.addEventListener('click', (e) => {
    const target = e.target;
    if (target === form || (target instanceof Element && target.tagName === 'LABEL')) email.focus();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = email.value.trim();
    if (!EMAIL_RE.test(v)) {
      log.textContent = '> ' + v + '\n' + MSG_INVALID;
      return;
    }
    log.textContent = '> ' + v + '\n' + MSG_RECEIVED;
    email.value = '';
  });
}

function initCopyButton(): void {
  const copy = document.getElementById('copy');
  const mail = document.getElementById('mail');
  if (!copy || !mail) return;

  const done = (label: string): void => {
    copy.textContent = '[ ' + label + ' ]';
    setTimeout(() => { copy.textContent = COPY_LABEL; }, COPY_RESET_MS);
  };
  // no clipboard access (or it was refused): select the address so ctrl+c works
  const select = (): void => {
    const range = document.createRange();
    range.selectNodeContents(mail);
    const selection = getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    done('selected');
  };

  copy.addEventListener('click', () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(mail.textContent ?? '').then(() => done('copied'), select);
    } else {
      select();
    }
  });
}
