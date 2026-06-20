// auth.js - Login, register, forgot-password, and reset-password page logic.
// This file is used by login.html, forgot-password.html, and reset-password.html.
// It does NOT run on admin.html or client-portal.html.

(function () {
  function showLoginMessage(message) {
    const errorBox = document.getElementById('login-error');
    if (!errorBox || !message) return;
    errorBox.className = 'form-status error-message';
    errorBox.textContent = message;
  }

  function initLoginPageMessage() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('inactive') === '1') {
      showLoginMessage('Your account is inactive. Please contact an administrator for access.');
      params.delete('inactive');
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }

  function getPortalDestination(profile) {
    return profile.role === 'admin' ? 'admin.html' : 'client-portal.html';
  }

  async function redirectIfLoggedIn() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    const session = await getSession();
    if (!session) return;
    const profile = await getCurrentUserProfile();
    if (!profile) return;
    if (profile.role !== 'admin' && profile.status === 'inactive') {
      await supabaseClient.auth.signOut();
      return;
    }
    window.location.replace(getPortalDestination(profile));
    return true;
  }

  function initLoginTabs() {
    const tabSignin = document.getElementById('tab-signin');
    const tabRegister = document.getElementById('tab-register');
    const panelSignin = document.getElementById('panel-signin');
    const panelRegister = document.getElementById('panel-register');

    if (!tabSignin || !tabRegister) return;

    tabSignin.addEventListener('click', function () {
      tabSignin.classList.add('active');
      tabSignin.setAttribute('aria-selected', 'true');
      tabRegister.classList.remove('active');
      tabRegister.setAttribute('aria-selected', 'false');
      if (panelSignin) panelSignin.hidden = false;
      if (panelRegister) panelRegister.hidden = true;
    });

    tabRegister.addEventListener('click', function () {
      tabRegister.classList.add('active');
      tabRegister.setAttribute('aria-selected', 'true');
      tabSignin.classList.remove('active');
      tabSignin.setAttribute('aria-selected', 'false');
      if (panelRegister) panelRegister.hidden = false;
      if (panelSignin) panelSignin.hidden = true;
    });
  }

  function initLoginForm() {
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-button');
    if (!loginForm || !loginBtn) return;

    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errorBox = document.getElementById('login-error');
      if (errorBox) { errorBox.textContent = ''; errorBox.className = 'form-status'; }

      if (!email || !password) {
        if (errorBox) { errorBox.className = 'form-status error-message'; errorBox.textContent = 'Enter both your email and password.'; }
        return;
      }
      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        if (errorBox) { errorBox.className = 'form-status error-message'; errorBox.textContent = 'Login is temporarily unavailable.'; }
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Signing in…';

      try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
          if (errorBox) { errorBox.className = 'form-status error-message'; errorBox.textContent = error.message; }
          loginBtn.disabled = false;
          loginBtn.textContent = 'Sign In';
          return;
        }

        const profile = await getCurrentUserProfile();
        if (!profile) {
          if (errorBox) {
            errorBox.className = 'form-status error-message';
            errorBox.textContent = 'Unable to load your account profile. This may be caused by a security policy. Check the browser console for details, or contact support.';
          }
          await supabaseClient.auth.signOut();
          loginBtn.disabled = false;
          loginBtn.textContent = 'Sign In';
          return;
        }

        if (profile.role !== 'admin' && profile.status === 'inactive') {
          await supabaseClient.auth.signOut();
          if (errorBox) { errorBox.className = 'form-status error-message'; errorBox.textContent = 'Your account is inactive. Please contact an administrator for access.'; }
          loginBtn.disabled = false;
          loginBtn.textContent = 'Sign In';
          return;
        }

        window.location.href = getPortalDestination(profile);
      } catch (err) {
        if (errorBox) { errorBox.className = 'form-status error-message'; errorBox.textContent = 'Unable to sign in. Please try again.'; }
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
      }
    });
  }

  function initRegisterForm() {
    const registerForm = document.getElementById('register-form');
    const registerBtn = document.getElementById('register-button');
    if (!registerForm || !registerBtn) return;

    registerForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const fullName = registerForm.querySelector('[name="full_name"]').value.trim();
      const email = registerForm.querySelector('[name="email"]').value.trim();
      const phone = registerForm.querySelector('[name="phone"]')?.value.trim() || null;
      const userType = registerForm.querySelector('[name="user_type"]')?.value || '';
      const password = registerForm.querySelector('[name="password"]').value;
      const statusEl = document.getElementById('register-status');
      if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

      if (!email || !password) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Email and password are required.'; }
        return;
      }
      if (!userType) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Please select your user type.'; }
        return;
      }
      if (password.length < 8) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Password must be at least 8 characters.'; }
        return;
      }
      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Registration is temporarily unavailable.'; }
        return;
      }

      registerBtn.disabled = true;
      registerBtn.textContent = 'Creating account…';

      try {
        const { error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, phone, role: 'client', user_type: userType } }
        });

        if (error) {
          if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = error.message; }
          registerBtn.disabled = false;
          registerBtn.textContent = 'Create Account';
          return;
        }

        if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Account created! Check your email to confirm your address, then sign in.'; }
        registerForm.reset();
      } catch (err) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Registration failed. Please try again.'; }
      }

      registerBtn.disabled = false;
      registerBtn.textContent = 'Create Account';
    });
  }

  function initForgotPasswordForm() {
    const form = document.getElementById('forgot-password-form');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = form.querySelector('[name="email"]').value.trim();
      const statusEl = document.getElementById('forgot-status');
      const submitBtn = form.querySelector('button[type="submit"]');

      if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

      if (!email) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Please enter your email address.'; }
        return;
      }

      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Service unavailable. Please try again later.'; }
        return;
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: new URL('reset-password.html', window.location.href).href
      });

      if (error) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = error.message; }
      } else {
        if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Password reset email sent. Check your inbox and follow the link.'; }
        form.reset();
      }

      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Reset Link'; }
    });
  }

  function initResetPasswordForm() {
    const form = document.getElementById('reset-password-form');
    const formContainer = document.getElementById('reset-form-container');
    const invalidEl = document.getElementById('reset-invalid');
    if (!form) return;

    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      supabaseClient.auth.onAuthStateChange(function (event) {
        if (event === 'PASSWORD_RECOVERY') {
          if (formContainer) formContainer.hidden = false;
          if (invalidEl) invalidEl.hidden = true;
        }
      });

      getSession().then(function (session) {
        if (session) {
          if (formContainer) formContainer.hidden = false;
          if (invalidEl) invalidEl.hidden = true;
        } else {
          if (formContainer) formContainer.hidden = true;
          if (invalidEl) invalidEl.hidden = true;
        }
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const passwordEl = document.getElementById('new-password');
      const confirmEl = document.getElementById('confirm-password');
      const statusEl = document.getElementById('reset-status');
      const submitBtn = document.getElementById('reset-submit-btn');
      const password = passwordEl ? passwordEl.value : '';
      const confirm = confirmEl ? confirmEl.value : '';

      if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

      if (password.length < 8) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Password must be at least 8 characters.'; }
        return;
      }
      if (password !== confirm) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Passwords do not match.'; }
        return;
      }
      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Service unavailable. Please try again later.'; }
        return;
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Updating…'; }

      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = error.message; }
      } else {
        if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Password updated successfully. Redirecting to your portal…'; }
        setTimeout(async function () {
          const profile = await getCurrentUserProfile();
          window.location.replace(profile ? getPortalDestination(profile) : 'login.html');
        }, 1000);
      }

      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Update Password'; }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    initLoginPageMessage();
    const redirected = await redirectIfLoggedIn();
    if (redirected) return;
    initLoginTabs();
    initLoginForm();
    initRegisterForm();
    initForgotPasswordForm();
    initResetPasswordForm();
  });
})();
