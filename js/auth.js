// =====================================================================
//  MINI ARCADE AUTH & GUEST TRIAL GATE ENGINE (SUPABASE)
// =====================================================================

(function() {
  const ARCADE_SUPABASE_URL = "https://ysbyzlkjmhcougpkfjuu.supabase.co";
  const ARCADE_SUPABASE_ANON_KEY = "sb_publishable__muFoFXpZA1cZgoj5kbljw_tAmCNRkR";

  let client = window.supabaseClient;
  if (!client && window.supabase) {
    client = window.supabase.createClient(ARCADE_SUPABASE_URL, ARCADE_SUPABASE_ANON_KEY);
    window.supabaseClient = client;
  }

  const GUEST_MATCH_LIMIT = 5;

  const ArcadeAuth = {
    currentUser: null,

    init: async function() {
      this.injectAuthModal();
      this.updateTopBar();

      if (!client) return;

      const { data: { session } } = await client.auth.getSession();
      if (session && session.user) {
        this.currentUser = session.user;
        this.updateTopBar();
      }

      client.auth.onAuthStateChange((_event, session) => {
        this.currentUser = session ? session.user : null;
        this.updateTopBar();
        if (this.currentUser) {
          this.closeModal();
        }
      });
    },

    getGuestPlays: function() {
      return parseInt(localStorage.getItem('mini_arcade_plays') || '0', 10);
    },

    recordGamePlay: function() {
      if (this.currentUser) return true;

      let plays = this.getGuestPlays() + 1;
      localStorage.setItem('mini_arcade_plays', plays);
      this.updateTopBar();

      if (plays >= GUEST_MATCH_LIMIT) {
        this.showModal(true);
        return false;
      }
      return true;
    },

    canPlay: function() {
      if (this.currentUser) return true;
      if (this.getGuestPlays() >= GUEST_MATCH_LIMIT) {
        this.showModal(true);
        return false;
      }
      return true;
    },

    updateTopBar: function() {
      const signInBtn = document.querySelector('.topright button') || document.getElementById('auth-btn');
      const onlinePill = document.getElementById('online-count');

      if (!signInBtn) return;

      if (this.currentUser) {
        const email = this.currentUser.email;
        const name = email.split('@')[0];
        signInBtn.disabled = false;
        signInBtn.title = "Click to sign out";
        signInBtn.textContent = `👤 ${name} (Sign out)`;
        signInBtn.onclick = () => this.signOut();
        if (onlinePill) {
          onlinePill.innerHTML = `● Unlimited Access`;
        }
      } else {
        const plays = this.getGuestPlays();
        const left = Math.max(0, GUEST_MATCH_LIMIT - plays);
        signInBtn.disabled = false;
        signInBtn.title = "Sign in or create account";
        signInBtn.textContent = "Sign in";
        signInBtn.onclick = () => this.showModal(false);

        if (onlinePill) {
          onlinePill.innerHTML = `● ${left} guest passes left`;
        }
      }
    },

    injectAuthModal: function() {
      if (document.getElementById('arcade-auth-modal')) return;

      const modal = document.createElement('div');
      modal.id = 'arcade-auth-modal';
      modal.style.cssText = `
        display: none; position: fixed; inset: 0; z-index: 9999;
        background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(10px);
        align-items: center; justify-content: center; padding: 16px;
      `;

      modal.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(20px); border-radius: 24px; padding: 28px 24px; max-width: 360px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.3); text-align: center; border: 1px solid rgba(255,255,255,0.4); font-family: 'Inter', sans-serif;">
          <div style="font-size: 40px; margin-bottom: 6px;">🕹️</div>
          <h2 id="auth-title" style="margin: 0 0 6px; font-size: 22px; color: #1c1c1e;">Welcome to Mini Arcade</h2>
          <p id="auth-desc" style="font-size: 13px; color: #636366; margin: 0 0 18px;">Sign in or register to track stats and enjoy unlimited gaming.</p>

          <form id="auth-form" style="display: flex; flex-direction: column; gap: 10px;">
            <input type="email" id="auth-email" placeholder="Email address" required style="padding: 12px 14px; border-radius: 12px; border: 1px solid #d1d1d6; font-size: 14px; outline: none; background:#fff; color:#000;">
            <input type="password" id="auth-password" placeholder="Password (min 6 chars)" required minlength="6" style="padding: 12px 14px; border-radius: 12px; border: 1px solid #d1d1d6; font-size: 14px; outline: none; background:#fff; color:#000;">
            <div id="auth-msg" style="font-size: 12px; color: #ff3b30; min-height: 16px;"></div>
            <button type="submit" id="auth-submit-btn" style="padding: 12px; border-radius: 12px; background: #007aff; color: #fff; font-weight: 600; border: none; cursor: pointer; font-size: 15px;">Sign Up & Unlock</button>
          </form>

          <div style="margin-top: 14px; font-size: 13px; color: #636366;">
            <span id="auth-switch-text">Already have an account?</span>
            <a href="#" id="auth-switch-btn" style="color: #007aff; font-weight: 600; text-decoration: none; margin-left: 4px;">Sign In</a>
          </div>
          <button id="auth-close-x" style="display: none; margin-top: 12px; background: none; border: none; color: #8e8e93; font-size: 13px; cursor: pointer;">Close for now</button>
        </div>
      `;

      document.body.appendChild(modal);

      let isSignUp = true;
      const authForm = document.getElementById('auth-form');
      const authTitle = document.getElementById('auth-title');
      const authSubmit = document.getElementById('auth-submit-btn');
      const authSwitch = document.getElementById('auth-switch-btn');
      const authSwitchText = document.getElementById('auth-switch-text');
      const authMsg = document.getElementById('auth-msg');
      const authClose = document.getElementById('auth-close-x');

      authSwitch.onclick = (e) => {
        e.preventDefault();
        isSignUp = !isSignUp;
        authMsg.textContent = '';
        if (isSignUp) {
          authTitle.textContent = "Create Account";
          authSubmit.textContent = "Sign Up & Unlock";
          authSwitchText.textContent = "Already have an account?";
          authSwitch.textContent = "Sign In";
        } else {
          authTitle.textContent = "Welcome Back";
          authSubmit.textContent = "Sign In";
          authSwitchText.textContent = "New player?";
          authSwitch.textContent = "Create Account";
        }
      };

      authClose.onclick = () => this.closeModal();

      authForm.onsubmit = async (e) => {
        e.preventDefault();
        authMsg.style.color = '#007aff';
        authMsg.textContent = 'Processing...';

        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;

        if (isSignUp) {
          const { error } = await client.auth.signUp({ email, password });
          if (error) {
            authMsg.style.color = '#ff3b30';
            authMsg.textContent = error.message;
          } else {
            authMsg.style.color = '#34c759';
            authMsg.textContent = "Account created! Unlocking arcade...";
            setTimeout(() => location.reload(), 1000);
          }
        } else {
          const { error } = await client.auth.signInWithPassword({ email, password });
          if (error) {
            authMsg.style.color = '#ff3b30';
            authMsg.textContent = error.message;
          } else {
            authMsg.style.color = '#34c759';
            authMsg.textContent = "Success! Logged in.";
            setTimeout(() => location.reload(), 800);
          }
        }
      };
    },

    showModal: function(isMandatory = false) {
      const modal = document.getElementById('arcade-auth-modal');
      const title = document.getElementById('auth-title');
      const closeBtn = document.getElementById('auth-close-x');
      const authDesc = document.getElementById('auth-desc');

      if (!modal) return;
      modal.style.display = 'flex';

      if (isMandatory) {
        title.textContent = "Free Passes Ended!";
        closeBtn.style.display = 'none';
        authDesc.textContent = "You've completed your 5 free guest games! Create an account to unlock unlimited play.";
      } else {
        title.textContent = "Welcome to Mini Arcade";
        closeBtn.style.display = 'inline-block';
        authDesc.textContent = "Sign in or register to track stats and enjoy unlimited gaming.";
      }
    },

    closeModal: function() {
      const modal = document.getElementById('arcade-auth-modal');
      if (modal) modal.style.display = 'none';
    },

    signOut: async function() {
      if (client) {
        await client.auth.signOut();
        this.currentUser = null;
        location.reload();
      }
    }
  };

  window.ArcadeAuth = ArcadeAuth;
  document.addEventListener('DOMContentLoaded', () => ArcadeAuth.init());
})();