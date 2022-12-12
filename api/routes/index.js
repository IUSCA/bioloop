const express = require("express");
const router = express.Router();
let config = require("config");


router.use("/auth", require("./auth"));
router.use("/feedback", require("./feedback"))
router.use("/users", require("./users"));
router.use("/roles", require("./roles"));
// router.use("/requests", require("./requests"));
router.use("/search", require("./search").router);

router.get("/health", function (req, res, next) {
    res.json({ status: "ok", mode: config.get("site.mode") });
});


module.exports = router;