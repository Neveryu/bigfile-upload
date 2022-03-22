const Controller = require("./controller")
const http = require("http")
const server = http.createServer()

const controller = new Controller()

server.on("request", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "*")
  if (req.method === "OPTIONS") {
    res.status = 200
    res.end()
    return
  }

  // 校验md5
  if (req.url === '/verify') {
    controller.handleVerifyUpload(req, res)
  }

  // 合并文件片段
  if (req.url === '/merge') {
    controller.handleMerge(req, res)
  }

  // 提交文件
  if (req.url === '/') {
    controller.handleFormData(req, res)
  }

});

server.listen(9999, () => console.log("正在监听 9999 端口"))
