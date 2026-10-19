// =====================================================================
//  SUPABASE REALTIME MULTIPLAYER ENGINE FOR MINI ARCADE
// =====================================================================

(function() {
  const ARCADE_SUPABASE_URL = "https://ysbyzlkjmhcougpkfjuu.supabase.co";
  const ARCADE_SUPABASE_ANON_KEY = "sb_publishable__muFoFXpZA1cZgoj5kbljw_tAmCNRkR";

  // Use existing client or initialize new one safely
  let client = window.supabaseClient;
  if (!client && window.supabase) {
    client = window.supabase.createClient(ARCADE_SUPABASE_URL, ARCADE_SUPABASE_ANON_KEY);
    window.supabaseClient = client;
  }

  class OnlineManager {
    constructor(gameName, callbacks = {}) {
      this.gameName = gameName;
      this.onPlayerJoined = callbacks.onPlayerJoined || (() => {});
      this.onMoveReceived = callbacks.onMoveReceived || (() => {});
      this.onRoomReady = callbacks.onRoomReady || (() => {});

      this.roomCode = null;
      this.channel = null;
      this.isHost = false;
      this.playerNumber = 0; // 0 = Host / Player 1, 1 = Guest / Player 2

      // Retrieve or set persistent guest ID
      let savedId = localStorage.getItem('mini_arcade_guest_id');
      if (!savedId) {
        savedId = 'guest_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('mini_arcade_guest_id', savedId);
      }
      this.playerId = savedId;
    }

    // Generate clean 4-character room code
    generateCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    }

    // Host creates a room
    async createRoom() {
      if (!client) {
        alert("Supabase SDK is not loaded!");
        return null;
      }

      this.roomCode = this.generateCode();
      this.isHost = true;
      this.playerNumber = 0;

      const { error } = await client.from('rooms').insert([
        { code: this.roomCode, game: this.gameName, host_id: this.playerId, status: 'waiting' }
      ]);

      if (error) {
        console.error("Room creation error:", error);
        alert("Failed to create room: " + error.message);
        return null;
      }

      this.connectRealtimeChannel();
      return this.roomCode;
    }

    // Guest joins using code
    async joinRoom(code) {
      if (!client) {
        alert("Supabase SDK is not loaded!");
        return false;
      }

      const cleanCode = code.toUpperCase().trim();
      const { data, error } = await client
        .from('rooms')
        .select('*')
        .eq('code', cleanCode)
        .eq('game', this.gameName)
        .single();

      if (error || !data) {
        alert("Room not found! Check code and game.");
        return false;
      }

      if (data.status === 'playing') {
        alert("This room is already full!");
        return false;
      }

      this.roomCode = cleanCode;
      this.isHost = false;
      this.playerNumber = 1;

      await client
        .from('rooms')
        .update({ guest_id: this.playerId, status: 'playing' })
        .eq('code', this.roomCode);

      this.connectRealtimeChannel();

      // Broadcast join event to host
      setTimeout(() => {
        if (this.channel) {
          this.channel.send({
            type: 'broadcast',
            event: 'player_join',
            payload: { guestId: this.playerId }
          });
        }
        this.onRoomReady(this.playerNumber);
      }, 600);

      return true;
    }

    // Subscribe to real-time events on WebSocket channel
    connectRealtimeChannel() {
      this.channel = client.channel(`room_${this.roomCode}`, {
        config: { broadcast: { self: false } }
      });

      this.channel
        .on('broadcast', { event: 'player_join' }, ({ payload }) => {
          if (this.isHost) {
            this.onPlayerJoined(payload);
            this.onRoomReady(this.playerNumber);
          }
        })
        .on('broadcast', { event: 'game_move' }, ({ payload }) => {
          this.onMoveReceived(payload);
        })
        .subscribe((status) => {
          console.log(`Subscribed to room ${this.roomCode}:`, status);
        });
    }

    // Send action to opponent
    sendMove(payload) {
      if (!this.channel) return;
      this.channel.send({
        type: 'broadcast',
        event: 'game_move',
        payload: payload
      });
    }

    disconnect() {
      if (this.channel && client) {
        client.removeChannel(this.channel);
      }
    }
  }

  // Expose to window
  window.OnlineManager = OnlineManager;
})();