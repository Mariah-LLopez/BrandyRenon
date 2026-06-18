(function () {
  const PHONE_REGEX = /^[0-9()+\-\s.]{7,20}$/;
  const CONTACT_TYPES_REQUIRING_PROPERTY = ['property_inquiry', 'showing_request'];

  function inquiryNeedsProperty(type) {
    return CONTACT_TYPES_REQUIRING_PROPERTY.includes(type);
  }

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

  function validateBaseFields(form) {
    clearErrors(form);
    let valid = true;

    const name = form.querySelector('[name="name"]') || form.querySelector('[name="full_name"]');
    const email = form.querySelector('[name="email"]');
    const phone = form.querySelector('[name="phone"]');
    const message = form.querySelector('[name="message"]') || form.querySelector('[name="project_description"]');
    const inquiryType = form.querySelector('[name="inquiry_type"]');
    const property = form.querySelector('[name="property"]');

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
      setError(message, 'Please include a description.');
    }

    if (inquiryType && !inquiryType.value) {
      valid = false;
      setError(inquiryType, 'Please select the type of message.');
    }

    if (property && inquiryType && inquiryNeedsProperty(inquiryType.value) && !property.value) {
      valid = false;
      setError(property, 'Please select the property you are asking about.');
    }

    return valid;
  }

  function syncContactPropertyField(form) {
    const inquiryType = form.querySelector('[name="inquiry_type"]');
    const propertyGroup = form.querySelector('[data-contact-property-group]');
    const propertySelect = form.querySelector('[name="property"]');
    if (!inquiryType || !propertyGroup || !propertySelect) return;

    const shouldShow = inquiryNeedsProperty(inquiryType.value)
      || (propertySelect.dataset.wasPreselected === 'true' && !inquiryType.value);
    propertyGroup.hidden = !shouldShow;
    propertySelect.required = inquiryNeedsProperty(inquiryType.value);
    propertySelect.setAttribute('aria-required', propertySelect.required ? 'true' : 'false');

    if (!shouldShow) {
      propertySelect.value = '';
      propertySelect.classList.remove('input-error');
      const error = propertyGroup.querySelector('.field-error');
      if (error) error.textContent = '';
    }
  }

  function initContactFormFields(form) {
    const inquiryType = form.querySelector('[name="inquiry_type"]');
    const propertySelect = form.querySelector('[name="property"]');
    if (!inquiryType || !propertySelect) return;
    propertySelect.dataset.wasPreselected = propertySelect.value ? 'true' : 'false';
    syncContactPropertyField(form);
    inquiryType.addEventListener('change', function () {
      propertySelect.dataset.wasPreselected = 'false';
      syncContactPropertyField(form);
    });
  }

  async function submitContactForm(form) {
    const messageBox = form.querySelector('.form-status');

    if (!validateBaseFields(form)) {
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Please correct the highlighted fields and try again.'; }
      return;
    }

    const name = form.querySelector('[name="name"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const phoneEl = form.querySelector('[name="phone"]');
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const inquiryTypeEl = form.querySelector('[name="inquiry_type"]');
    const inquiryType = inquiryTypeEl ? inquiryTypeEl.value : '';
    const propertySelect = form.querySelector('[name="property"]');
    const message = form.querySelector('[name="message"]').value.trim();
    let propertyInterest = null;

    if (propertySelect && propertySelect.value) {
      const property = window.PROPERTIES
        ? window.PROPERTIES.find((item) => item.id === propertySelect.value)
        : null;
      propertyInterest = property
        ? `${property.title} — ${property.address}`
        : propertySelect.options[propertySelect.selectedIndex]?.textContent || propertySelect.value;
    }

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Unable to submit. Please refresh and try again.'; }
      return;
    }

    const { error } = await supabaseClient.from('contact_requests').insert([{
      name,
      email,
      phone,
      inquiry_type: inquiryType,
      property_interest: propertyInterest,
      message
    }]);

    if (error) {
      console.error('Contact form error:', error);
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Submission failed: ' + error.message; }
      return;
    }

    form.reset();
    populatePropertySelects();
    syncContactPropertyField(form);
    if (messageBox) { messageBox.className = 'form-status success-message'; messageBox.textContent = 'Thank you! Your message has been received.'; }
  }

  async function submitShowingForm(form) {
    const messageBox = form.querySelector('.form-status');

    if (!validateBaseFields(form)) {
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Please correct the highlighted fields and try again.'; }
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
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Unable to submit. Please refresh and try again.'; }
      return;
    }

    const { error } = await supabaseClient.from('showing_requests').insert([{ name, email, phone, property_address, preferred_date, preferred_time, message }]);

    if (error) {
      console.error('Showing form error:', error);
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Submission failed: ' + error.message; }
      return;
    }

    form.reset();
    populatePropertySelects();
    if (messageBox) { messageBox.className = 'form-status success-message'; messageBox.textContent = 'Thank you! Your showing request has been received.'; }
  }

  async function submitHouseFlipForm(form) {
    const messageBox = form.querySelector('.form-status');

    if (!validateBaseFields(form)) {
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Please correct the highlighted fields and try again.'; }
      return;
    }

    const addressEl = form.querySelector('[name="property_address"]');
    if (addressEl && !addressEl.value.trim()) {
      setError(addressEl, 'Please enter the property address.');
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Please correct the highlighted fields and try again.'; }
      return;
    }

    const full_name = form.querySelector('[name="full_name"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const phoneEl = form.querySelector('[name="phone"]');
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const property_address = addressEl ? addressEl.value.trim() : '';
    const estimatedEl = form.querySelector('[name="estimated_value"]');
    const conditionEl = form.querySelector('[name="property_condition"]');
    const descEl = form.querySelector('[name="project_description"]');

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Unable to submit. Please refresh and try again.'; }
      return;
    }

    const { error } = await supabaseClient.from('house_flip_inquiries').insert([{
      full_name,
      email,
      phone: phone || null,
      property_address: property_address || null,
      estimated_value: estimatedEl ? estimatedEl.value.trim() || null : null,
      property_condition: conditionEl ? conditionEl.value || null : null,
      project_description: descEl ? descEl.value.trim() || null : null
    }]);

    if (error) {
      console.error('House flip form error:', error);
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Submission failed: ' + error.message; }
      return;
    }

    form.reset();
    if (messageBox) { messageBox.className = 'form-status success-message'; messageBox.textContent = 'Thank you! We will review your property and be in touch shortly.'; }
  }

  async function submitContractorForm(form) {
    const messageBox = form.querySelector('.form-status');

    if (!validateBaseFields(form)) {
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Please correct the highlighted fields and try again.'; }
      return;
    }

    const serviceEl = form.querySelector('[name="service_type"]');
    if (serviceEl && !serviceEl.value) {
      setError(serviceEl, 'Please select your primary service type.');
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Please correct the highlighted fields and try again.'; }
      return;
    }

    const full_name = form.querySelector('[name="full_name"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const phoneEl = form.querySelector('[name="phone"]');
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const companyEl = form.querySelector('[name="company_name"]');
    const areaEl = form.querySelector('[name="service_area"]');
    const descEl = form.querySelector('[name="project_description"]');

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Unable to submit. Please refresh and try again.'; }
      return;
    }

    const { error } = await supabaseClient.from('contractor_inquiries').insert([{
      full_name,
      email,
      phone: phone || null,
      company_name: companyEl ? companyEl.value.trim() || null : null,
      service_type: serviceEl ? serviceEl.value || null : null,
      service_area: areaEl ? areaEl.value.trim() || null : null,
      project_description: descEl ? descEl.value.trim() || null : null
    }]);

    if (error) {
      console.error('Contractor form error:', error);
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Submission failed: ' + error.message; }
      return;
    }

    form.reset();
    if (messageBox) { messageBox.className = 'form-status success-message'; messageBox.textContent = 'Thank you! Your application has been received. We will be in touch if there is a match.'; }
  }

  function handleFormSubmission(form) {
    const formType = form.getAttribute('data-form-type');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (formType === 'contact') submitContactForm(form);
      else if (formType === 'showing') submitShowingForm(form);
      else if (formType === 'flip') submitHouseFlipForm(form);
      else if (formType === 'contractor') submitContractorForm(form);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    populatePropertySelects();
    document.querySelectorAll('form[data-form-type]').forEach((form) => {
      if (form.getAttribute('data-form-type') === 'contact') initContactFormFields(form);
      handleFormSubmission(form);
    });
  });
})();
