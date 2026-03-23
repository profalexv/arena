const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.send('This is the panel backend.');
});

module.exports = router;
