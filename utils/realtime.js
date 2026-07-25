// Shared helper for pushing live updates to the admin panel over Socket.IO
// (server setup + the 'admins' room are in index.js). Best-effort: a missing
// or broken socket server should never break the request that triggered it.
const emitToAdmins = (req, event, payload) => {
    try {
        req.app.locals.io?.to('admins').emit(event, payload);
    } catch (err) {
        console.error(`Failed to emit ${event}:`, err.message);
    }
};

module.exports = { emitToAdmins };
