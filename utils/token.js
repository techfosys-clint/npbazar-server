const jwt = require('jsonwebtoken');

// `type` distinguishes admin tokens from user tokens so they can't be used interchangeably.
const signToken = (payload, type) =>
    jwt.sign({ ...payload, type }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

module.exports = { signToken, verifyToken };
