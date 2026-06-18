(function () {
  const PHONE_REGEX = /^[0-9()+\-\s.]{7,20}$/;

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

  async function submitContactForm(form) {
    const messageBox = form.querySelector('.form-status');

    if (!validateForm(form)) {
      if (messageBox) {
        messageBox.className = 'form-status error-message';
        messageBox.textContent = 'Please correct the highlighted fields and try again.';
      }
      return;
    }

    const name = form.querySelector('[name="name"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const phoneEl = form.querySelector('[name="phone"]');
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const message = form.querySelector('[name="message"]').value.trim();

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      if (messageBox) {
        messageBox.className = 'form-status error-message';
        messageBox.textContent = 'Unable to submit. Please refresh and try again.';
      }
      return;
    }

    const { error } = await supabaseClient
      .from('contact_requests')
      .insert([{ name, email, phone, message }]);

    if (error) {
      console.error('Contact form error:', error);
      if (messageBox) {
        messageBox.className = 'form-status error-message';
        messageBox.textContent = 'Submission failed: ' + error.message;
      }
      return;
    }

    form.reset();
    populatePropertySelects();
    if (messageBox) {
      messageBox.className = 'form-status success-message';
      messageBox.textContent = 'Thank you! Your message has been received.';
    }
  }

  async function submitShowingForm(form) {
    const messageBox = form.querySelector('.form-status');

    if (!validateForm(form)) {
      if (messageBox) {
        messageBox.className = 'form-status error-message';
        messageBox.textContent = 'Please correct the highlighted fields and try again.';
      }
      return;
    }

    const name = form.querySelector('[name="name"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const phoneEl = form.querySelector('[name="phone"]');
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const message = form.querySelector('[name="message"]').value.trim();

    const propertySelect = form.querySelector('[name="property"]');
    const preferredDateEl = form.querySelector('[name="preferred_date"]');
    const preferredTimeEl = form.querySelector('[name="preferred_time"]');

    let property_address = '';
    if (propertySelect && propertySelect.value && window.PROPERTIES) {
      const found = window.PROPERTIES.find((p) => p.id === propertySelect.value);
      property_address = found ? `${found.title} — ${found.address}` : propertySelect.value;
    }

    const preferred_date = preferredDateEl ? preferredDateEl.value : '';
    const preferred_time = preferredTimeEl ? preferredTimeEl.value : '';

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      if (messageBox) {
        messageBox.className = 'form-status error-message';
        messageBox.textContent = 'Unable to submit. Please refresh and try again.';
      }
      return;
    }

    const { error } = await supabaseClient
      .from('showing_requests')
      .insert([{ name, email, phone, property_address, preferred_date, preferred_time, message }]);

    if (error) {
      console.error('Showing form error:', error);
      if (messageBox) {
        messageBox.className = 'form-status error-message';
        messageBox.textContent = 'Submission failed: ' + error.message;
      }
      return;
    }

    form.reset();
    populatePropertySelects();
    if (messageBox) {
      messageBox.className = 'form-status success-message';
      messageBox.textContent = 'Thank you! Your showing request has been received.';
    }
  }

  function handleFormSubmission(form) {
    const formType = form.getAttribute('data-form-type');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (formType === 'contact') {
        submitContactForm(form);
      } else if (formType === 'showing') {
        submitShowingForm(form);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    populatePropertySelects();
    document.querySelectorAll('form[data-form-type="contact"], form[data-form-type="showing"]').forEach(handleFormSubmission);
  });
})();
