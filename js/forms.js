(function () {
  const PHONE_REGEX = /^[0-9()+\-\s.]{7,20}$/;
  const CONTACT_TYPES_REQUIRING_PROPERTY = ['property_inquiry', 'showing_request'];
  const DEFAULT_LEAD_STATUS = 'Not Reviewed Yet';

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
          option.textContent = `${property.title} - ${property.address}`;
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

    const shouldShow = inquiryNeedsProperty(inquiryType.value);
    propertyGroup.hidden = !shouldShow;
    propertySelect.required = shouldShow;
    propertySelect.setAttribute('aria-required', shouldShow ? 'true' : 'false');

    if (!shouldShow) {
      propertySelect.value = '';
      propertySelect.classList.remove('input-error');
      const error = propertyGroup.querySelector('.field-error');
      if (error) error.textContent = '';
    }
  }

  function initContactFormFields(form) {
    const inquiryType = form.querySelector('[name="inquiry_type"]');
    if (!inquiryType) return;
    syncContactPropertyField(form);
    inquiryType.addEventListener('change', function () {
      syncContactPropertyField(form);
    });
  }

  function getPropertyInterest(select) {
    if (!select || !select.value) return null;
    const property = window.PROPERTIES
      ? window.PROPERTIES.find((item) => item.id === select.value)
      : null;
    return property
      ? `${property.title} - ${property.address}`
      : select.options[select.selectedIndex]?.textContent || select.value;
  }

  async function insertShowingRequest(payload) {
    return supabaseClient.from('showing_requests').insert([payload]);
  }

  function getContactSuccessMessage(type) {
    return {
      general_question: 'Thank you! Your message has been received.',
      showing_request: 'Thank you! Your showing request has been received.',
      property_inquiry: 'Thank you! Your property inquiry has been received.',
      renovation_client_inquiry: 'Thank you! Your renovation client inquiry has been received.',
      contractor_inquiry: 'Thank you! Your renovation client inquiry has been received.',
      house_flip_inquiry: 'Thank you! Your renovation client inquiry has been received.'
    }[type] || 'Thank you! Your message has been received.';
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
    const propertyInterest = getPropertyInterest(propertySelect);

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Unable to submit. Please refresh and try again.'; }
      return;
    }

    let result;

    if (inquiryType === 'general_question') {
      result = await supabaseClient.from('contact_requests').insert([{
        name,
        email,
        phone,
        inquiry_type: inquiryType,
        property_interest: null,
        message,
        admin_status: DEFAULT_LEAD_STATUS,
        admin_notes: null
      }]);
    } else if (inquiryType === 'showing_request' || inquiryType === 'property_inquiry') {
      result = await insertShowingRequest({
        name,
        email,
        phone,
        property_address: propertyInterest,
        preferred_date: null,
        preferred_time: null,
        request_type: inquiryType,
        message,
        admin_status: DEFAULT_LEAD_STATUS,
        admin_notes: null
      });
    } else if (inquiryType === 'contractor_inquiry' || inquiryType === 'house_flip_inquiry' || inquiryType === 'renovation_client_inquiry') {
      result = await supabaseClient.from('renovation_clients').insert([{
        full_name: name,
        email,
        phone: phone || null,
        property_address: propertyInterest,
        service_needed: 'Renovation Support',
        project_type: 'Renovation Projects',
        project_description: message,
        status: DEFAULT_LEAD_STATUS,
        admin_notes: null
      }]);
    } else {
      result = { error: { message: 'Unsupported inquiry type.' } };
    }

    if (result.error) {
      console.error('Contact form error:', result.error);
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Submission failed: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(result.error) : result.error.message); }
      return;
    }

    notifySubmission({
      submission_type: inquiryType === 'showing_request' ? 'Showing Request' : inquiryType === 'property_inquiry' ? 'Property Inquiry' : inquiryType === 'renovation_client_inquiry' ? 'Renovation Client Inquiry' : 'Contact Request',
      name,
      email,
      phone,
      property_of_interest: propertyInterest,
      details: message,
      submitted_at: new Date().toISOString()
    });

    form.reset();
    populatePropertySelects();
    syncContactPropertyField(form);
    if (messageBox) { messageBox.className = 'form-status success-message'; messageBox.textContent = getContactSuccessMessage(inquiryType); }
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

    const propertyAddress = getPropertyInterest(propertySelect) || '';
    const preferredDate = preferredDateEl ? preferredDateEl.value || null : null;
    const preferredTime = preferredTimeEl ? preferredTimeEl.value || null : null;

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Unable to submit. Please refresh and try again.'; }
      return;
    }

    const { error } = await insertShowingRequest({
      name,
      email,
      phone,
      property_address: propertyAddress || null,
      preferred_date: preferredDate,
      preferred_time: preferredTime,
      request_type: 'showing_request',
      message,
      admin_status: DEFAULT_LEAD_STATUS,
      admin_notes: null
    });

    if (error) {
      console.error('Showing form error:', error);
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Submission failed: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(error) : error.message); }
      return;
    }

    notifySubmission({
      submission_type: 'Showing Request',
      name,
      email,
      phone,
      property_of_interest: propertyAddress || null,
      details: message,
      submitted_at: new Date().toISOString()
    });

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

    const fullName = form.querySelector('[name="full_name"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const phoneEl = form.querySelector('[name="phone"]');
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const propertyAddress = addressEl ? addressEl.value.trim() : '';
    const conditionEl = form.querySelector('[name="property_condition"]');
    const descEl = form.querySelector('[name="project_description"]');

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Unable to submit. Please refresh and try again.'; }
      return;
    }

    const { error } = await supabaseClient.from('renovation_clients').insert([{
      full_name: fullName,
      email,
      phone: phone || null,
      property_address: propertyAddress || null,
      service_needed: conditionEl ? conditionEl.value || 'Renovation Support' : 'Renovation Support',
      project_type: 'Renovation Projects',
      project_description: descEl ? descEl.value.trim() || null : null,
      status: DEFAULT_LEAD_STATUS,
      admin_notes: null
    }]);

    if (error) {
      console.error('Renovation client form error:', error);
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Submission failed: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(error) : error.message); }
      return;
    }

    notifySubmission({
      submission_type: 'Renovation Client Inquiry',
      name: fullName,
      email,
      phone,
      property_of_interest: propertyAddress || null,
      details: (descEl ? descEl.value.trim() : '') || null,
      submitted_at: new Date().toISOString()
    });

    form.reset();
    if (messageBox) { messageBox.className = 'form-status success-message'; messageBox.textContent = 'Thank you! Your renovation client inquiry has been received.'; }
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

    const fullName = form.querySelector('[name="full_name"]').value.trim();
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

    const { error } = await supabaseClient.from('renovation_clients').insert([{
      full_name: fullName,
      email,
      phone: phone || null,
      property_address: null,
      service_needed: serviceEl ? serviceEl.value || null : null,
      project_type: 'Renovation Projects',
      project_description: [
        companyEl && companyEl.value.trim() ? `Company: ${companyEl.value.trim()}` : '',
        areaEl && areaEl.value.trim() ? `Service Area: ${areaEl.value.trim()}` : '',
        descEl ? descEl.value.trim() : ''
      ].filter(Boolean).join('\n\n') || null,
      status: DEFAULT_LEAD_STATUS,
      admin_notes: null
    }]);

    if (error) {
      console.error('Renovation client form error:', error);
      if (messageBox) { messageBox.className = 'form-status error-message'; messageBox.textContent = 'Submission failed: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(error) : error.message); }
      return;
    }

    notifySubmission({
      submission_type: 'Renovation Client Inquiry',
      name: fullName,
      email,
      phone,
      property_of_interest: null,
      details: [
        companyEl && companyEl.value.trim() ? `Company: ${companyEl.value.trim()}` : '',
        areaEl && areaEl.value.trim() ? `Service Area: ${areaEl.value.trim()}` : '',
        descEl ? descEl.value.trim() : ''
      ].filter(Boolean).join('\n\n') || null,
      submitted_at: new Date().toISOString()
    });

    form.reset();
    if (messageBox) { messageBox.className = 'form-status success-message'; messageBox.textContent = 'Thank you! Your renovation client inquiry has been received.'; }
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const type = form.getAttribute('data-form-type');
    if (type === 'contact') submitContactForm(form);
    else if (type === 'showing') submitShowingForm(form);
    else if (type === 'house-flip') submitHouseFlipForm(form);
    else if (type === 'contractor') submitContractorForm(form);
  }

  document.addEventListener('DOMContentLoaded', function () {
    populatePropertySelects();
    document.querySelectorAll('[data-form-type="contact"]').forEach(initContactFormFields);
    document.querySelectorAll('form[data-form-type]').forEach((form) => {
      form.addEventListener('submit', handleFormSubmit);
    });
  });
})();
