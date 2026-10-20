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

  const GUEST_MATCH_LIMIT = 10;

  const ArcadeAuth = {
    currentUser: null,
    currentUsername: null,

    init: async function() {
      this.injectAuthModal();
      this.injectSettingsModal();
      this.injectConfirmModal();
      this.updateTopBar();

      // Browser back/forward button (bfcache) se aane par live sync
      window.addEventListener('pageshow', () => this.updateTopBar());
      window.addEventListener('popstate', () => this.updateTopBar());

      // Window focus aur alag tabs/windows ke storage updates sync
      window.addEventListener('focus', () => this.updateTopBar());
      window.addEventListener('storage', (e) => {
        if (e.key === 'mini_arcade_plays' || e.key === 'arcade_total_plays') {
          this.updateTopBar();
        }
      });

      if (!client) return;

      const { data: { session } } = await client.auth.getSession();
      if (session && session.user) {
        this.currentUser = session.user;
        await this.loadUserProfile();
        this.updateTopBar();
      }

      client.auth.onAuthStateChange(async (_event, session) => {
        this.currentUser = session ? session.user : null;
        if (this.currentUser) {
          await this.loadUserProfile();
          this.closeModal();
        } else {
          this.currentUsername = null;
        }
        this.updateTopBar();
      });
    },

    loadUserProfile: async function() {
      if (!this.currentUser) return;
      try {
        const { data } = await client
          .from('profiles')
          .select('username')
          .eq('id', this.currentUser.id)
          .maybeSingle();

        if (data && data.username) {
          this.currentUsername = data.username;
        } else {
          this.currentUsername = this.currentUser.email.split('@')[0];
        }
      } catch (err) {
        this.currentUsername = this.currentUser.email.split('@')[0];
      }
    },

    getGuestPlays: function() {
      return parseInt(localStorage.getItem('mini_arcade_plays') || '0', 10);
    },

    recordGamePlay: async function(won = false) {
      let totalPlays = parseInt(localStorage.getItem('arcade_total_plays') || '0', 10) + 1;
      let totalWins = parseInt(localStorage.getItem('arcade_total_wins') || '0', 10) + (won ? 1 : 0);
      localStorage.setItem('arcade_total_plays', totalPlays);
      localStorage.setItem('arcade_total_wins', totalWins);

      if (this.currentUser) {
        try {
          const { data } = await client
            .from('profiles')
            .select('wins, matches, score')
            .eq('id', this.currentUser.id)
            .maybeSingle();

          if (data) {
            await client.from('profiles').update({
              matches: (data.matches || 0) + 1,
              wins: (data.wins || 0) + (won ? 1 : 0),
              score: (data.score || 0) + (won ? 100 : 10),
              updated_at: new Date().toISOString()
            }).eq('id', this.currentUser.id);
          }
        } catch (e) {
          console.error("Leaderboard stats sync error:", e);
        }
        return true;
      }

      this.updateTopBar();
      return true;
    },

    canPlay: function() {
      if (this.currentUser) return true;

      let plays = this.getGuestPlays();
      if (plays >= GUEST_MATCH_LIMIT) {
        this.showModal(true);
        return false;
      }

      // Tap karte hi deduct (-1) aur live bar update
      plays++;
      localStorage.setItem('mini_arcade_plays', plays.toString());
      this.updateTopBar();

      return true;
    },

    updateTopBar: function() {
      const signInBtn = document.querySelector('.topright button') || document.getElementById('auth-btn');
      const onlinePill = document.getElementById('online-count');

      if (!signInBtn) return;

      if (this.currentUser) {
        const name = this.currentUsername || this.currentUser.email.split('@')[0];
        signInBtn.disabled = false;
        signInBtn.title = "Settings & Profile";
        signInBtn.textContent = `👤 ${name}`;
        signInBtn.onclick = () => this.showSettingsModal();
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
          onlinePill.innerHTML = `● ${left} guest ${left === 1 ? 'pass' : 'passes'} left`;
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
        <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); border-radius: 24px; padding: 28px 24px; max-width: 360px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.3); text-align: center; border: 1px solid rgba(255,255,255,0.4); font-family: 'Inter', sans-serif;">
          <div style="font-size: 40px; margin-bottom: 6px;">🕹️</div>
          <h2 id="auth-title" style="margin: 0 0 6px; font-size: 22px; color: #1c1c1e;">Welcome to Mini Arcade</h2>
          <p id="auth-desc" style="font-size: 13px; color: #636366; margin: 0 0 18px;">Sign in or register to track stats and enjoy unlimited gaming.</p>

          <form id="auth-form" style="display: flex; flex-direction: column; gap: 10px;">
            <input type="text" id="auth-username" placeholder="Pick a Gamer Username (unique)" style="display:none; padding: 12px 14px; border-radius: 12px; border: 1px solid #d1d1d6; font-size: 14px; outline: none; background:#fff; color:#000;">
            <input type="text" id="auth-identifier" placeholder="Email or Username" required style="padding: 12px 14px; border-radius: 12px; border: 1px solid #d1d1d6; font-size: 14px; outline: none; background:#fff; color:#000;">
            <input type="password" id="auth-password" placeholder="Password (min 6 chars)" required minlength="6" style="padding: 12px 14px; border-radius: 12px; border: 1px solid #d1d1d6; font-size: 14px; outline: none; background:#fff; color:#000;">
            <div id="auth-msg" style="font-size: 12px; color: #ff3b30; min-height: 16px;"></div>
            <button type="submit" id="auth-submit-btn" style="padding: 12px; border-radius: 12px; background: #007aff; color: #fff; font-weight: 600; border: none; cursor: pointer; font-size: 15px;">Sign In</button>
          </form>

          <div style="margin-top: 14px; font-size: 13px; color: #636366;">
            <span id="auth-switch-text">New player?</span>
            <a href="#" id="auth-switch-btn" style="color: #007aff; font-weight: 600; text-decoration: none; margin-left: 4px;">Create Account</a>
          </div>
          <button id="auth-close-x" style="display: none; margin-top: 12px; background: none; border: none; color: #8e8e93; font-size: 13px; cursor: pointer;">Close for now</button>
        </div>
      `;

      document.body.appendChild(modal);

      let isSignUp = false;
      const authForm = document.getElementById('auth-form');
      const authTitle = document.getElementById('auth-title');
      const authSubmit = document.getElementById('auth-submit-btn');
      const authSwitch = document.getElementById('auth-switch-btn');
      const authSwitchText = document.getElementById('auth-switch-text');
      const authMsg = document.getElementById('auth-msg');
      const authClose = document.getElementById('auth-close-x');
      const authUsername = document.getElementById('auth-username');
      const authIdentifier = document.getElementById('auth-identifier');

      authSwitch.onclick = (e) => {
        e.preventDefault();
        isSignUp = !isSignUp;
        authMsg.textContent = '';
        if (isSignUp) {
          authTitle.textContent = "Create Account";
          authSubmit.textContent = "Sign Up & Unlock";
          authSwitchText.textContent = "Already have an account?";
          authSwitch.textContent = "Sign In";
          authUsername.style.display = 'block';
          authUsername.required = true;
          authIdentifier.placeholder = "Email address";
          authIdentifier.type = "email";
        } else {
          authTitle.textContent = "Welcome Back";
          authSubmit.textContent = "Sign In";
          authSwitchText.textContent = "New player?";
          authSwitch.textContent = "Create Account";
          authUsername.style.display = 'none';
          authUsername.required = false;
          authIdentifier.placeholder = "Email or Username";
          authIdentifier.type = "text";
        }
      };

      authClose.onclick = () => this.closeModal();

      authForm.onsubmit = async (e) => {
        e.preventDefault();
        authMsg.style.color = '#007aff';
        authMsg.textContent = 'Processing...';

        const identifier = authIdentifier.value.trim();
        const password = document.getElementById('auth-password').value;

        if (isSignUp) {
          const username = authUsername.value.trim().toLowerCase();
          if (username.length < 3) {
            authMsg.style.color = '#ff3b30';
            authMsg.textContent = 'Username must be at least 3 characters.';
            return;
          }

          const { data: existing } = await client
            .from('profiles')
            .select('id')
            .eq('username', username)
            .maybeSingle();

          if (existing) {
            authMsg.style.color = '#ff3b30';
            authMsg.textContent = 'Username already taken! Try another.';
            return;
          }

          const { data, error } = await client.auth.signUp({ email: identifier, password });
          if (error) {
            authMsg.style.color = '#ff3b30';
            authMsg.textContent = error.message;
          } else {
            if (data && data.user) {
              await client.from('profiles').insert([
                { id: data.user.id, username: username, score: 0, wins: 0, matches: 0 }
              ]);
            }
            authMsg.style.color = '#34c759';
            authMsg.textContent = "Account created! Unlocking arcade...";
            setTimeout(() => location.reload(), 1000);
          }
        } else {
          let loginEmail = identifier;
          
          if (!identifier.includes('@')) {
            const { data: prof, error: profErr } = await client
              .from('profiles')
              .select('id')
              .eq('username', identifier.toLowerCase())
              .maybeSingle();

            if (profErr || !prof) {
              authMsg.style.color = '#ff3b30';
              authMsg.textContent = 'Username not found!';
              return;
            }

            authMsg.style.color = '#ff3b30';
            authMsg.textContent = 'Please enter your registered email to log in, or sign up!';
            return;
          }

          const { error } = await client.auth.signInWithPassword({ email: loginEmail, password });
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

    // ---------- SETTINGS & PROFILE MODAL ----------
    injectSettingsModal: function() {
      if (document.getElementById('arcade-settings-modal')) return;

      const modal = document.createElement('div');
      modal.id = 'arcade-settings-modal';
      modal.style.cssText = `
        display: none; position: fixed; inset: 0; z-index: 10000;
        background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(10px);
        align-items: center; justify-content: center; padding: 16px;
      `;

      modal.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); border-radius: 24px; padding: 24px 22px; max-width: 380px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.4); font-family: 'Inter', sans-serif; color: #1c1c1e; box-sizing: border-box;">
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0; font-size:19px; font-weight:700;">⚙️ Profile & Settings</h3>
            <button id="set-close-x" style="background:rgba(0,0,0,0.06); border:none; border-radius:50%; width:30px; height:30px; font-size:13px; line-height:1; cursor:pointer; color:#3a3a3c; display:flex; align-items:center; justify-content:center; padding:0;">✕</button>
          </div>

          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-bottom:16px;">
            <div style="background:rgba(0,0,0,0.04); border-radius:12px; padding:10px 4px; text-align:center;">
              <b id="set-stat-plays" style="display:block; font-size:17px; color:#007aff;">0</b>
              <small style="font-size:11px; color:#8e8e93;">Matches</small>
            </div>
            <div style="background:rgba(0,0,0,0.04); border-radius:12px; padding:10px 4px; text-align:center;">
              <b id="set-stat-wins" style="display:block; font-size:17px; color:#34c759;">0</b>
              <small style="font-size:11px; color:#8e8e93;">Wins</small>
            </div>
            <div style="background:rgba(0,0,0,0.04); border-radius:12px; padding:10px 4px; text-align:center;">
              <b id="set-stat-rate" style="display:block; font-size:17px; color:#ff9500;">0%</b>
              <small style="font-size:11px; color:#8e8e93;">Win Rate</small>
            </div>
          </div>

          <div style="border-top:1px solid rgba(0,0,0,0.08); padding-top:12px; margin-bottom:14px;">
            <span style="font-size:12px; font-weight:600; color:#8e8e93; text-transform:uppercase;">Gamer Username</span>
            <div style="display:flex; gap:8px; margin-top:6px;">
              <input type="text" id="set-new-username" placeholder="Unique username" style="flex:1; padding:9px 12px; border-radius:10px; border:1px solid #d1d1d6; font-size:13px; outline:none; background:#fff; color:#000;">
              <button id="set-update-uname-btn" style="padding:9px 14px; border-radius:10px; background:#007aff; color:#fff; border:none; font-weight:600; font-size:13px; cursor:pointer;">Save</button>
            </div>
            <div id="set-uname-msg" style="font-size:11px; margin-top:4px; min-height:14px;"></div>
          </div>

          <div style="border-top:1px solid rgba(0,0,0,0.08); padding-top:12px; margin-bottom:14px;">
            <div style="font-size:13px; margin-bottom:4px;">
              <b>Email:</b> <span id="set-email-display" style="color:#636366;"></span>
            </div>
            <div style="font-size:12px; color:#34c759; display:flex; align-items:center; gap:5px;">
              <span>●</span> Active on this device
            </div>
          </div>

          <div style="border-top:1px solid rgba(0,0,0,0.08); padding-top:12px; margin-bottom:14px;">
            <span style="font-size:12px; font-weight:600; color:#8e8e93; text-transform:uppercase;">Change Password</span>
            <input type="password" id="set-new-pwd" placeholder="New Password (min 6 chars)" style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid #d1d1d6; font-size:13px; outline:none; background:#fff; color:#000; box-sizing:border-box; margin:8px 0;">
            <button id="set-update-pwd-btn" style="width:100%; padding:9px; border-radius:10px; background:rgba(0,0,0,0.06); border:none; font-weight:600; font-size:13px; cursor:pointer; color:#1c1c1e;">Update Password</button>
            <div id="set-pwd-msg" style="font-size:11px; margin-top:4px; min-height:14px;"></div>
          </div>

          <div style="border-top:1px solid rgba(0,0,0,0.08); padding-top:12px; display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; gap:8px;">
              <button id="set-logout-cur" style="flex:1; padding:9px; border-radius:10px; background:rgba(0,0,0,0.06); border:none; font-weight:600; font-size:13px; cursor:pointer; color:#1c1c1e;">Log Out</button>
              <button id="set-logout-all" style="flex:1; padding:9px; border-radius:10px; background:rgba(0,0,0,0.06); border:none; font-weight:600; font-size:13px; cursor:pointer; color:#1c1c1e;">Log Out All Devices</button>
            </div>
            <button id="set-delete-acc" style="width:100%; padding:9px; border-radius:10px; background:rgba(255,59,48,0.1); border:1px solid rgba(255,59,48,0.25); color:#ff3b30; font-weight:600; font-size:13px; cursor:pointer;">Clear Stats</button>
          </div>

        </div>
      `;

      document.body.appendChild(modal);

      document.getElementById('set-close-x').onclick = () => this.closeSettingsModal();
      modal.onclick = (e) => {
        if (e.target.id === 'arcade-settings-modal') this.closeSettingsModal();
      };

      document.getElementById('set-update-uname-btn').onclick = async () => {
        const newUname = document.getElementById('set-new-username').value.trim().toLowerCase();
        const msg = document.getElementById('set-uname-msg');

        if (newUname.length < 3) {
          msg.style.color = '#ff3b30';
          msg.textContent = 'Username must be at least 3 characters.';
          return;
        }

        msg.style.color = '#007aff';
        msg.textContent = 'Checking availability...';

        const { data: existing } = await client
          .from('profiles')
          .select('id')
          .eq('username', newUname)
          .neq('id', this.currentUser.id)
          .maybeSingle();

        if (existing) {
          msg.style.color = '#ff3b30';
          msg.textContent = 'Username already taken!';
          return;
        }

        const { error } = await client
          .from('profiles')
          .upsert({ id: this.currentUser.id, username: newUname, updated_at: new Date().toISOString() });

        if (error) {
          msg.style.color = '#ff3b30';
          msg.textContent = error.message;
        } else {
          this.currentUsername = newUname;
          msg.style.color = '#34c759';
          msg.textContent = 'Username saved!';
          this.updateTopBar();
        }
      };

      document.getElementById('set-update-pwd-btn').onclick = async () => {
        const newPwd = document.getElementById('set-new-pwd').value.trim();
        const msg = document.getElementById('set-pwd-msg');
        if (newPwd.length < 6) {
          msg.style.color = '#ff3b30';
          msg.textContent = 'Password must be at least 6 characters.';
          return;
        }

        msg.style.color = '#007aff';
        msg.textContent = 'Updating...';

        const { error } = await client.auth.updateUser({ password: newPwd });
        if (error) {
          msg.style.color = '#ff3b30';
          msg.textContent = error.message;
        } else {
          msg.style.color = '#34c759';
          msg.textContent = 'Password updated successfully!';
          document.getElementById('set-new-pwd').value = '';
        }
      };

      document.getElementById('set-logout-cur').onclick = () => this.signOut();
      document.getElementById('set-logout-all').onclick = async () => {
        if (client) {
          await client.auth.signOut({ scope: 'global' });
          this.currentUser = null;
          location.reload();
        }
      };

      document.getElementById('set-delete-acc').onclick = () => {
        this.showConfirmModal("Clear Stats", "Are you sure you want to reset all your matches and win rate stats to zero?", () => {
          localStorage.removeItem('arcade_total_plays');
          localStorage.removeItem('arcade_total_wins');
          document.getElementById('set-stat-plays').textContent = '0';
          document.getElementById('set-stat-wins').textContent = '0';
          document.getElementById('set-stat-rate').textContent = '0%';
        });
      };
    },

    injectConfirmModal: function() {
      if (document.getElementById('arcade-confirm-modal')) return;

      const modal = document.createElement('div');
      modal.id = 'arcade-confirm-modal';
      modal.style.cssText = `
        display: none; position: fixed; inset: 0; z-index: 10001;
        background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(10px);
        align-items: center; justify-content: center; padding: 16px;
      `;

      modal.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(25px); border-radius: 20px; padding: 22px 20px; max-width: 320px; width: 100%; box-shadow: 0 20px 45px rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.4); font-family: 'Inter', sans-serif; text-align: center; color: #1c1c1e;">
          <h4 id="confirm-title" style="margin: 0 0 8px; font-size: 17px; font-weight: 700;">Confirm Action</h4>
          <p id="confirm-desc" style="font-size: 13px; color: #636366; line-height: 1.5; margin: 0 0 18px;"></p>
          <div style="display: flex; gap: 8px;">
            <button id="confirm-cancel" style="flex: 1; padding: 10px; border-radius: 10px; background: rgba(0,0,0,0.06); border: none; font-weight: 600; font-size: 13px; cursor: pointer; color: #1c1c1e;">Cancel</button>
            <button id="confirm-ok" style="flex: 1; padding: 10px; border-radius: 10px; background: #ff3b30; border: none; font-weight: 600; font-size: 13px; cursor: pointer; color: #fff;">Clear</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
    },

    showConfirmModal: function(title, desc, onConfirm) {
      const modal = document.getElementById('arcade-confirm-modal');
      if (!modal) return;

      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-desc').textContent = desc;

      const cancelBtn = document.getElementById('confirm-cancel');
      const okBtn = document.getElementById('confirm-ok');

      const cleanup = () => {
        modal.style.display = 'none';
        cancelBtn.onclick = null;
        okBtn.onclick = null;
      };

      cancelBtn.onclick = cleanup;
      okBtn.onclick = () => {
        cleanup();
        if (onConfirm) onConfirm();
      };

      modal.style.display = 'flex';
    },

    showSettingsModal: function() {
      const modal = document.getElementById('arcade-settings-modal');
      if (!modal) return;

      const plays = parseInt(localStorage.getItem('arcade_total_plays') || '0', 10);
      const wins = parseInt(localStorage.getItem('arcade_total_wins') || '0', 10);
      const rate = plays > 0 ? Math.round((wins / plays) * 100) : 0;

      document.getElementById('set-stat-plays').textContent = plays;
      document.getElementById('set-stat-wins').textContent = wins;
      document.getElementById('set-stat-rate').textContent = rate + "%";
      document.getElementById('set-email-display').textContent = this.currentUser?.email || 'Player';
      document.getElementById('set-new-username').value = this.currentUsername || '';
      document.getElementById('set-uname-msg').textContent = '';
      document.getElementById('set-pwd-msg').textContent = '';

      modal.style.display = 'flex';
    },

    closeSettingsModal: function() {
      const modal = document.getElementById('arcade-settings-modal');
      if (modal) modal.style.display = 'none';
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
        authDesc.textContent = "You've completed your 10 free guest games! Create an account to unlock unlimited play.";
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
        this.currentUsername = null;
        location.reload();
      }
    }
  };

  window.ArcadeAuth = ArcadeAuth;
  document.addEventListener('DOMContentLoaded', () => ArcadeAuth.init());
})();