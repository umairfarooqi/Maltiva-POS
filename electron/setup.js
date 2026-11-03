const form = document.getElementById('setup-form');
const fields = document.getElementById('fields');
const error = document.getElementById('error');
const button = document.getElementById('submit');
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (fields.disabled) return;
  error.hidden = true;
  const data = new FormData(form);
  if (data.get('password') !== data.get('confirmation')) {
    error.textContent = 'The passwords do not match. Enter them again.';
    error.hidden = false; error.focus(); return;
  }
  fields.disabled = true; button.textContent = 'Creating account…';
  try {
    const result = await window.ownerSetup.submit({ name: data.get('name'), username: data.get('username'), password: data.get('password'), pin: data.get('pin') });
    if (!result.ok) throw new Error(result.error);
    form.reset(); button.textContent = 'Opening your till…';
  } catch (failure) {
    fields.disabled = false; button.textContent = 'Create owner account';
    error.textContent = failure.message || 'Setup could not finish. Close and reopen Maltiva POS to try again.';
    error.hidden = false; error.focus();
  }
});
