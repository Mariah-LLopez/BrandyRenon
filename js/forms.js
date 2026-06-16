(function () {
  const PHONE_REGEX = /^[0-9()+\-\s.]{7,20}$/;
  const SUCCESS_NOTE = 'DEVELOPER NOTE: Connect form submissions to your CMS, CRM, or business email service (e.g., Formspree, Netlify Forms, EmailJS). Do NOT store submissions in publicly accessible files.';

  function populatePropertySelects() {
    const selects = document.querySelectorAll('.property-select');
    if (!selects.length || !window.PROPERTIES) return;
    const selectedProperty = window.getUrlParam ? window.getUrlParam('property') : null;

    selects.forEach((select) => {
      const existingOptions = Array.from(select.querySelectorAll('option')).map((option) => option.value);
      window.PROPERTIES.forEach((property) => {
        if (!existingOptions.includes(property.id)) {
          const option = document.createElement('option');
          option.value = property.id;
          option.textContent = `${property.title} — ${property.address}`;
          select.appendChild(option);
        }
      });
      if (selectedProperty) select.value = selectedProperty;
    });
  }

  function clearErrors(form) {
    form.querySelectorAll('.field-error').forEach((error) => (error.textContent = ''));
    form.querySelectorAll('.input-error').forEach((field) => field.classList.remove('input-error'));
  }

  function setError(field, message) {
    field.classList.add('input-error');
    const error = field.closest('.form-group')?.querySelector('.field-error');
    if (error) error.textContent = message;
  }

  function validateForm(form) {
    clearErrors(form);
    let valid = true;

    const name = form.querySelector('[name="name"]');
    const email = form.querySelector('[name="email"]');
    const phone = form.querySelector('[name="phone"]');
    const message = form.querySelector('[name="message"]');

    if (name && !name.value.trim()) {
      valid = false;
      setError(name, 'Please enter your name.');
    }

    if (email && !email.value.trim()) {
      valid = false;
      setError(email, 'Please enter your email address.');
    } else if (email && !email.checkValidity()) {
      valid = false;
      setError(email, 'Please enter a valid email address.');
    }

    if (phone && phone.value.trim() && !PHONE_REGEX.test(phone.value.trim())) {
      valid = false;
      setError(phone, 'Please enter a valid phone number.');
    }

    if (message && message.required && !message.value.trim()) {
      valid = false;
      setError(message, 'Please include your message or showing request.');
    }

    return valid;
  }

  function handleFormSubmission(form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const messageBox = form.querySelector('.form-status');
      if (!validateForm(form)) {
        if (messageBox) {
          messageBox.className = 'form-status error-message';
          messageBox.textContent = 'Please correct the highlighted fields and try again.';
        }
        return;
      }

      form.reset();
      populatePropertySelects();
      if (messageBox) {
        messageBox.className = 'form-status success-message';
        messageBox.textContent = 'Thank you! Your inquiry has been captured for follow-up.';
      }
      console.log(SUCCESS_NOTE);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    populatePropertySelects();
    document.querySelectorAll('form[data-form-type="contact"], form[data-form-type="showing"]').forEach(handleFormSubmission);
  });
})();
