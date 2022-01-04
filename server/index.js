const Controller = require('./controller')
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

  if (req.url === '/merge') {
  	controller.handleMerge(req, res)
  }

  if (req.url === '/') {
  	controller.handleFormData(req, res)
  }

});

server.listen(9999, () => console.log("正在监听 9999 端口"))
