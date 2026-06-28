// auth.js - Login and reset-password page logic.
// This file is used by login.html and reset-password.html.
// It does NOT run on admin.html or client-portal.html.

(function () {
  const PASSWORD_UPDATE_REDIRECT_DELAY = 1500;
  const RESET_PASSWORD_PAGE = 'reset-password.html';

  function getPasswordResetRedirectUrl() {
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      return new URL(RESET_PASSWORD_PAGE, `${window.location.origin}/`).toString();
    }
    return new URL(`/${RESET_PASSWORD_PAGE}`, window.location.href).toString();
  }


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
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
    const pathname = window.location.pathname || '';
    if (pathname === RESET_PASSWORD_PAGE || pathname === `/${RESET_PASSWORD_PAGE}` || pathname.endsWith(`/${RESET_PASSWORD_PAGE}`)) return false;
    const session = await getSession();
    if (!session) return false;
    const profile = await getCurrentUserProfile();
    if (!profile) return false;
    if (profile.role !== 'admin' && profile.status === 'inactive') {
      await supabaseClient.auth.signOut();
      return false;
    }
    window.location.replace(getPortalDestination(profile));
    return true;
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

        const { profile, error: profileError } = await getCurrentUserProfile({ includeError: true });
        if (!profile) {
          if (profileError) console.error('Failed to load profile after login:', profileError);
          if (errorBox) {
            errorBox.className = 'form-status error-message';
            errorBox.textContent = profileError?.message || 'Unable to load your account profile. Check the browser console for details, or contact support.';
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
      const newPassword = passwordEl ? passwordEl.value : '';
      const confirm = confirmEl ? confirmEl.value : '';

      if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

      if (newPassword.length < 8) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Password must be at least 8 characters.'; }
        return;
      }
      if (newPassword !== confirm) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Passwords do not match.'; }
        return;
      }
      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Service unavailable. Please try again later.'; }
        return;
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Updating…'; }

      try {
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;

        if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Password updated successfully. You can now sign in.'; }
        // After reset, always route to sign-in so users re-authenticate with the new password.
        setTimeout(function () {
          window.location.replace('login.html');
        }, PASSWORD_UPDATE_REDIRECT_DELAY);
      } catch (err) {
        console.error('Reset password update failed:', err);
        if (statusEl) {
          statusEl.className = 'form-status error-message';
          statusEl.textContent = err.message || err.error_description || 'Unable to update password. Please try again.';
        }
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Update Password'; }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    initLoginPageMessage();
    const redirected = await redirectIfLoggedIn();
    if (redirected) return;
    initLoginForm();
    initResetPasswordForm();
  });
})();
