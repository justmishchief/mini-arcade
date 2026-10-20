// =====================================================================
//  MINI ARCADE FORUM ENGINE (Realtime Supabase Feed)
// =====================================================================

const feedEl = document.getElementById('forum-feed');
const inputEl = document.getElementById('forum-input');
const postBtn = document.getElementById('btn-post');
const charCount = document.getElementById('char-count');

inputEl.addEventListener('input', () => {
  charCount.textContent = (300 - inputEl.value.length) + " chars left";
});

// Helper to wait until Supabase client is initialized by auth.js
function getSupabaseClient() {
  if (window.ArcadeAuth && window.ArcadeAuth.supabase) {
    return window.ArcadeAuth.supabase;
  }
  if (window.supabaseClient) {
    return window.supabaseClient;
  }
  return null;
}

async function loadMessages() {
  const sb = getSupabaseClient();
  if (!sb) {
    feedEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--ink2); font-size:13px;">Connecting to forum...</div>`;
    return;
  }
  
  const { data, error } = await sb
    .from('forum_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error("Forum error:", error);
    feedEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--ink2); font-size:13px;">Could not load messages right now.</div>`;
    return;
  }

  renderFeed(data || []);
}

function renderFeed(messages) {
  if (!messages.length) {
    feedEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--ink2); font-size:13px;">No messages yet. Be the first to post!</div>`;
    return;
  }

  feedEl.innerHTML = messages.map(m => {
    const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const author = m.author_name || 'Guest';
    return `
      <div class="msg-card glass">
        <div class="msg-head">
          <span class="msg-user">🎮 ${escapeHtml(author)}</span>
          <span>${time}</span>
        </div>
        <div class="msg-body">${escapeHtml(m.content)}</div>
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

postBtn.onclick = async () => {
  const text = inputEl.value.trim();
  if (!text) return;

  const sb = getSupabaseClient();
  if (!sb) return alert("Connecting to server, please try again in a second!");

  // Use username from email if logged in, otherwise default to Guest
  const user = window.ArcadeAuth?.user;
  const authorName = user?.email ? user.email.split('@')[0] : 'Guest';

  postBtn.disabled = true;
  postBtn.textContent = "Posting...";

  const { error } = await sb.from('forum_messages').insert([
    { content: text, author_name: authorName }
  ]);

  postBtn.disabled = false;
  postBtn.textContent = "Post";

  if (!error) {
    inputEl.value = '';
    charCount.textContent = "300 chars left";
    loadMessages();
  } else {
    console.error("Post error:", error);
    alert("Could not post message: " + (error.message || "Please check connection"));
  }
};

// Supabase Realtime Subscription
let realtimeSubscribed = false;
function subscribeRealtime() {
  if (realtimeSubscribed) return;
  const sb = getSupabaseClient();
  if (!sb) return;

  sb.channel('public:forum_messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_messages' }, () => {
      loadMessages();
    })
    .subscribe();
  realtimeSubscribed = true;
}

// Ensure messages load as soon as auth / Supabase is ready
function initForum() {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (getSupabaseClient()) {
      clearInterval(interval);
      loadMessages();
      subscribeRealtime();
    } else if (attempts > 30) {
      clearInterval(interval);
      loadMessages();
    }
  }, 100);
}

document.addEventListener('DOMContentLoaded', initForum);