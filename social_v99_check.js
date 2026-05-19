(function(){
        const $ = (sel, root = document) => root.querySelector(sel);
        const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
        const app = $(".sw99Shell");
        const socket = window.io ? io() : null;

        let currentRoom = "dm-main";
        let currentTitle = "Main Chat";
        let localStream = null;
        let username = "Guest";

        try {
          const profile = JSON.parse(localStorage.getItem("swiflytv.activeProfile") || "null");
          const session = JSON.parse(localStorage.getItem("swiflytv.session") || "null");
          username = profile?.name || session?.name || "Guest";
        } catch {}

        function toast(msg, type) {
          if (window.swiflyToast) window.swiflyToast(msg, type || "success");
          else console.log("[SwiflyTV]", msg);
        }

        function esc(value) {
          return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
        }

        function setError(error) {
          const box = $("#sw99Error");
          if (!box) return;
          box.hidden = false;
          box.textContent = "Social error: " + (error && error.message ? error.message : String(error));
          console.error(error);
        }

        function roomKey(room) {
          return "swiflytv.social.v99." + room;
        }

        function readMessages(room) {
          try {
            const saved = JSON.parse(localStorage.getItem(roomKey(room)) || "[]");
            return Array.isArray(saved) ? saved : [];
          } catch { return []; }
        }

        function saveMessages(room, messages) {
          localStorage.setItem(roomKey(room), JSON.stringify(messages.slice(-120)));
        }

        function addMessage(message, persist = false) {
          const list = $("#sw99Messages");
          if (!list || !message) return;

          const mine = message.author === username;
          const item = document.createElement("article");
          item.className = "sw99Msg" + (mine ? " mine" : "");
          item.innerHTML =
            '<span>' + esc(message.author || "?").slice(0,1).toUpperCase() + '</span>' +
            '<div><header><b>' + esc(message.author || "Guest") + '</b><small>' + new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + '</small></header>' +
            '<p>' + esc(message.text || "") + '</p></div>';
          list.appendChild(item);
          list.scrollTop = list.scrollHeight;

          if (persist) {
            const messages = readMessages(currentRoom);
            messages.push(message);
            saveMessages(currentRoom, messages);
          }
        }

        function renderMessages(seed) {
          const list = $("#sw99Messages");
          if (!list) return;
          list.innerHTML = "";
          const saved = readMessages(currentRoom);
          const messages = saved.length ? saved : seed || [
            { author: "Swifly", text: "Welcome to " + currentTitle + ".", createdAt: Date.now() },
            { author: "Swifly", text: "Buttons here use a simpler system now, so they should actually respond.", createdAt: Date.now() + 5 }
          ];
          messages.forEach((message) => addMessage(message, false));
        }

        function switchTab(tab) {
          const useRooms = tab === "rooms";
          $("#sw99ChatPanel")?.classList.toggle("active", !useRooms);
          $("#sw99RoomsPanel")?.classList.toggle("active", useRooms);
          $$("[data-tab]").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
          if (useRooms) {
            $("#sw99Kind").textContent = "Watch Rooms";
            $("#sw99Title").textContent = "Room Lobby";
            $("#sw99InfoTitle").textContent = "Watch Rooms";
            $("#sw99InfoText").textContent = "Create, join, copy, or share a synced room.";
            renderRooms();
          } else {
            $("#sw99Kind").textContent = currentRoom.startsWith("channel") ? "Channel" : currentRoom.startsWith("group") ? "Group" : "Direct message";
            $("#sw99Title").textContent = currentTitle;
            $("#sw99InfoTitle").textContent = currentTitle;
            $("#sw99InfoText").textContent = "Chat, call, invite, or start a room.";
          }
        }

        function joinRoom(room, title) {
          currentRoom = room || "dm-main";
          currentTitle = title || currentRoom;
          $$("[data-room]").forEach((btn) => btn.classList.toggle("active", btn.dataset.room === currentRoom));
          $("#sw99Input").placeholder = "Message " + currentTitle + "...";
          switchTab("chat");
          renderMessages();
          socket?.emit("social:join", { roomId: currentRoom, name: username });
        }

        function createVirtual(kind) {
          const name = prompt(kind === "channel" ? "Channel name" : "Group name");
          if (!name || !name.trim()) return;
          const id = (kind === "channel" ? "channel-" : "group-") + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const sectionText = kind === "channel" ? "Channels" : "Groups";
          const section = $$(".sw99Section").find((sec) => (sec.querySelector("span")?.textContent || "").includes(sectionText));
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "sw99Room";
          btn.dataset.room = id;
          btn.dataset.title = kind === "channel" ? "# " + name.trim() : name.trim();
          btn.innerHTML = '<i class="bi ' + (kind === "channel" ? "bi-hash" : "bi-people") + '"></i><b>' + esc(name.trim()) + '</b><small>' + (kind === "channel" ? "Public" : "Group") + '</small>';
          section?.appendChild(btn);
          joinRoom(id, btn.dataset.title);
          toast((kind === "channel" ? "Channel" : "Group") + " created");
        }

        function localRooms() {
          try {
            const saved = JSON.parse(localStorage.getItem("swiflytv.socialWatchRooms") || "[]");
            return Array.isArray(saved) ? saved : [];
          } catch { return []; }
        }

        function saveLocalRooms(rooms) {
          localStorage.setItem("swiflytv.socialWatchRooms", JSON.stringify(rooms.slice(0, 30)));
        }

        function buildRoomUrl(room) {
          const params = new URLSearchParams();
          params.set("name", room.name || "SwiflyTV Watch Room");
          params.set("kind", room.kind || "blank");
          if (room.videoId) params.set("videoId", room.videoId);
          if (room.embedUrl) params.set("embedUrl", room.embedUrl);
          return "/watchrooms/" + encodeURIComponent(room.id) + "?" + params.toString();
        }

        async function renderRooms() {
          const target = $("#sw99RoomsList");
          if (!target) return;

          let rooms = localRooms();
          try {
            const res = await fetch("/api/watchrooms", { cache: "no-store" });
            const data = await res.json();
            if (Array.isArray(data.rooms)) {
              const seen = new Set(rooms.map((r) => r.id));
              data.rooms.forEach((room) => {
                if (room && room.id && !seen.has(room.id)) rooms.push(room);
              });
            }
          } catch {}

          if (!rooms.length) {
            target.innerHTML = '<p class="sw99Empty">No rooms yet. Create one.</p>';
            return;
          }

          target.innerHTML = rooms.slice(0, 20).map((room) => {
            const href = buildRoomUrl(room);
            return '<article class="sw99RoomResult">' +
              '<div><b>' + esc(room.name || "Watch Room") + '</b><small>' + esc(room.host || "Ready") + '</small></div>' +
              '<nav><a href="' + esc(href) + '">Open</a><button type="button" data-copy="' + esc(location.origin + href) + '">Copy</button><button type="button" data-share="' + esc(href) + '">Share</button></nav>' +
            '</article>';
          }).join("");
        }

        function createLocalRoom() {
          const room = {
            id: Math.random().toString(36).slice(2, 7) + "-" + Math.random().toString(36).slice(2, 7),
            name: "Social Watch Room",
            kind: "blank",
            host: username,
            createdAt: Date.now()
          };
          const rooms = localRooms();
          rooms.unshift(room);
          saveLocalRooms(rooms);
          renderRooms();
          toast("Room saved");
          return buildRoomUrl(room);
        }

        async function openCall(video) {
          const modal = $("#sw99CallModal");
          modal.hidden = false;
          $("#sw99CallTitle").textContent = currentTitle;
          $("#sw99CallType").textContent = video ? "Video call" : "Voice call";
          $("#sw99CallStatus").textContent = "Requesting permission...";
          try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: Boolean(video) });
            const localVideo = $("#sw99LocalVideo");
            localVideo.srcObject = localStream;
            localVideo.hidden = !video;
            $("#sw99CallStatus").textContent = video ? "Camera preview active" : "Microphone active";
            socket?.emit("social:call-join", { roomId: currentRoom, name: username, video: Boolean(video) });
          } catch {
            $("#sw99CallStatus").textContent = "Permission blocked or unavailable";
            toast("Permission blocked", "error");
          }
        }

        function closeCall() {
          if (localStream) localStream.getTracks().forEach((track) => track.stop());
          localStream = null;
          $("#sw99LocalVideo").srcObject = null;
          $("#sw99CallModal").hidden = true;
          socket?.emit("social:call-leave", { roomId: currentRoom, name: username });
        }

        document.addEventListener("click", async (event) => {
          try {
            const tab = event.target.closest("[data-tab]");
            if (tab) {
              event.preventDefault();
              switchTab(tab.dataset.tab);
              return;
            }

            const room = event.target.closest("[data-room]");
            if (room && room.tagName !== "A") {
              event.preventDefault();
              joinRoom(room.dataset.room, room.dataset.title);
              return;
            }

            const action = event.target.closest("[data-action]");
            if (action) {
              const name = action.dataset.action;
              if (name === "new-group") return createVirtual("group");
              if (name === "new-channel") return createVirtual("channel");
              if (name === "voice") return openCall(false);
              if (name === "video") return openCall(true);
              if (name === "close-call") return closeCall();
              if (name === "invite") {
                await (window.swiflyCopy ? window.swiflyCopy(location.origin + "/social?room=" + encodeURIComponent(currentRoom)) : navigator.clipboard.writeText(location.origin + "/social?room=" + encodeURIComponent(currentRoom)));
                return;
              }
              if (name === "refresh-rooms") return renderRooms();
              if (name === "attach") return toast("Attachments coming soon", "info");
              if (name === "mute") {
                if (!localStream) return toast("No active call", "info");
                localStream.getAudioTracks().forEach((track) => track.enabled = !track.enabled);
                return toast("Mic toggled");
              }
              if (name === "camera") {
                if (!localStream) return toast("No active camera", "info");
                localStream.getVideoTracks().forEach((track) => track.enabled = !track.enabled);
                return toast("Camera toggled");
              }
            }

            const copy = event.target.closest("[data-copy]");
            if (copy) {
              event.preventDefault();
              await (window.swiflyCopy ? window.swiflyCopy(copy.dataset.copy) : navigator.clipboard.writeText(copy.dataset.copy));
              return;
            }

            const share = event.target.closest("[data-share]");
            if (share) {
              event.preventDefault();
              const text = "Join my Watch Room: " + location.origin + share.dataset.share;
              const message = { roomId: currentRoom, author: username, text, createdAt: Date.now() };
              addMessage(message, true);
              socket?.emit("social:message", message);
              switchTab("chat");
              toast("Shared to chat");
              return;
            }
          } catch (error) {
            setError(error);
          }
        });

        $("#sw99Composer")?.addEventListener("submit", (event) => {
          event.preventDefault();
          const input = $("#sw99Input");
          const text = String(input.value || "").trim();
          if (!text) return;
          input.value = "";
          const message = { roomId: currentRoom, author: username, text, createdAt: Date.now() };
          addMessage(message, true);
          socket?.emit("social:message", message);
        });

        socket?.on("connect", () => {
          $("#sw99Status").textContent = "Live connected";
          socket.emit("social:join", { roomId: currentRoom, name: username });
        });

        socket?.on("disconnect", () => {
          $("#sw99Status").textContent = "Local mode";
        });

        socket?.on("social:message", (message) => {
          if (!message || message.roomId !== currentRoom || message.author === username) return;
          addMessage(message, true);
        });

        socket?.on("social:members", (payload) => {
          const el = $("#sw99Members");
          if (!el || !payload || payload.roomId !== currentRoom) return;
          const names = Array.isArray(payload.members) ? payload.members : [];
          el.innerHTML = names.length ? names.map((name) => '<p><i></i> ' + esc(name) + '</p>').join("") : '<p><i></i> You</p>';
        });

        const params = new URLSearchParams(location.search);
        if (app?.dataset.initialTab === "rooms" || params.get("tab") === "watchrooms") switchTab("rooms");
        else joinRoom(params.get("room") || currentRoom, currentTitle);

        renderRooms();

        window.SwiflySocial = { joinRoom, switchTab, renderRooms, createLocalRoom };
      })();
    