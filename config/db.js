const mongoose = require('mongoose');
const dns = require('dns');

// Windows dev machines sometimes have the OS DNS resolver pinned to 127.0.0.1
// (leftover VPN/proxy adapter) with nothing listening there, which breaks the
// SRV lookup that `mongodb+srv://` needs even though normal domain lookups
// still work via the OS stub resolver. Fall back to a public resolver for
// Node's own DNS queries so the SRV lookup succeeds regardless of local config.
if (dns.getServers().includes('127.0.0.1')) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            dbName: 'ecomus',
        });
        console.log(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
