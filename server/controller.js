// 使用 multiparty 包处理前端传来的 FormData
const multiparty = require('multiparty')
const path = require('path')
// fs-extra模块是系统fs模块的扩展，提供了更多便利的 API，并继承了fs模块的 API
const fse = require('fs-extra')

// 提取文件后缀名
const extractExt = filename => {
	return filename.slice(filename.lastIndexOf('.'), filename.length)
}

// 大文件存储目录
const UPLOAD_DIR = path.resolve(__dirname, '..', 'target')

/**
 * 读的内容写到writeStream中
 * @Author   Author
 * @DateTime 2021-12-31T15:38:45+0800
 * @param    {[type]}                 path        [读取的文件路径]
 * @param    {[type]}                 writeStream [写入目标文件的流]
 * @return   {[type]}                             [description]
 */
const pipeStream = (path, writeStream) => {
	return new Promise((resolve, reject) => {
		// 创建可读流
		const readStream = fse.createReadStream(path)
		// 设置编码为 utf8。
		// readerStream.setEncoding('二进制')
		// 处理流事件 --> data, end, and error
		readStream.on('end', () => {
			fse.unlinkSync(path)
			resolve()
		})
		readStream.pipe(writeStream)
	})
}

/**
 * 合并文件夹中的切片，生成一个完整的文件
 * @Author   Author
 * @DateTime 2021-12-30T17:41:19+0800
 * @param    {[string]}                 filePath [完整的文件路径(最终文件切片合并为一个完整的文件)]
 * @param    {[type]}                 fileHash [大文件的文件名]
 * @param    {[type]}                 size     [单个切片的大小]
 * @return   {[type]}                          [description]
 */
const mergeFileChunk = async (filePath, fileHash, size) => {
	// 所有的文件切片放在以“大文件-文件hash命名文件夹”中
	const chunkDir = path.resolve(UPLOAD_DIR, fileHash)
	const chunkPaths = await fse.readdir(chunkDir)
	// 根据切片下标进行排序
	// 否则直接读取目录的获得的顺序可能会错乱
	chunkPaths.sort((a, b) => {
		return a.split('-')[1] - b.split('-')[1]
	})
	await Promise.all(
		chunkPaths.map((chunkPath, index) => {
			return pipeStream(
				path.resolve(chunkDir, chunkPath),
				/**
				 * 创建写入的目标文件的流，并指定位置，
				 * 目的是能够并发合并多个可读流到可写流中，这样即使流的顺序不同也能传输到正确的位置，
				 * 所以这里还需要让前端在请求的时候多提供一个 size 参数。
				 * 其实也可以等上一个切片合并完后再合并下个切片，这样就不需要指定位置，
				 * 但传输速度会降低，所以使用了并发合并的手段，
				 */
				fse.createWriteStream(filePath, {
					start: index * size,
					end: (index + 1) * size
				})
			)
		})
	)

	// 文件合并后删除保存切片的目录
	fse.rmdirSync(chunkDir)
}

/**
 * 【获取 POST 请求内容】
 * POST 请求的内容全部的都在请求体中，
 * http.ServerRequest 并没有一个属性内容为请求体，原因是等待请求体传输可能是一件耗时的工作。比如上传文件。
 * 而很多时候我们可能并不需要理会请求体的内容，恶意的POST请求会大大消耗服务器的资源，
 * 所以 node.js 默认是不会解析请求体的，当你需要的时候，需要手动来做。
 * @Author   Author
 * @DateTime 2021-12-31T15:46:32+0800
 * @param    {[type]}                 req [description]
 * @return   {[type]}                     [description]
 */
const resolvePost = req => {
	return new Promise((resolve, reject) => {
		let chunk = ''
		// 通过req的data事件监听函数，每当接受到请求体的数据，就累加到chunk变量中
		req.on('data', data => {
			chunk += data
		})
		// 在end事件触发后，将post请求参数返回
		req.on('end', () => {
			resolve(JSON.parse(chunk))
		})
	})
}

/**
 * 返回已经上传切片名
 * @param {*} fileHash 
 * @returns 
 */
const createUploadedList = async fileHash => {
	return fse.existsSync(path.resolve(UPLOAD_DIR, fileHash))
		? await fse.readdir(path.resolve(UPLOAD_DIR, fileHash))
		: []
}

module.exports = class {
	// 合并切片
	async handleMerge(req, res) {
		const data = await resolvePost(req)
		const { fileHash, filename, size } = data
		const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${extractExt(filename)}`)
		// 如果大文件已经存在，则直接返回
		if (fse.existsSync(filePath)) {
			res.end(
				JSON.stringify({
					code: 0,
					message: 'file merged success'
				})
			)
			return
		}
		const chunkDir = path.resolve(UPLOAD_DIR, fileHash)
		// 切片目录不存在，则无法合并切片，报异常
		if (!fse.existsSync(chunkDir)) {
			res.end(
				JSON.stringify({
					code: 500,
					message: '文件上传失败-切片文件夹不存在'
				})
			)
			return
		}
		await mergeFileChunk(filePath, fileHash, size)
		res.end(
			JSON.stringify({
				code: 0,
				message: 'file merged success'
			})
		)
	}

	/**
	 * 处理前端上传过来的切片
	 * @Author   Author
	 * @DateTime 2022-01-04T10:24:17+0800
	 * @param    {[type]}                 req [description]
	 * @param    {[type]}                 res [description]
	 * @return   {[type]}                     [description]
	 */
	async handleFormData(req, res) {
		const multipart = new multiparty.Form()
		// 在 multipart.parse 的回调中
		// files 参数保存了 FormData 中文件，fields 参数保存了 FormData 中非文件的字段
		multipart.parse(req, async (err, fields, files) => {
			if (err) {
				console.log('处理某个切片时错误：', err)
				req.status = 500
				res.end('process file chunk failed')
				return
			}
			// console.log(fields, files, 'multipart内容')
			const [chunk] = files.chunk
			const [hash] = fields.hash
			const [fileHash] = fields.fileHash
			const [filename] = fields.filename

			const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${extractExt(filename)}`)
			// console.log('filePath：', filePath)
			const chunkDir = path.resolve(UPLOAD_DIR, fileHash)

			// 如果大文件已经存在，则直接返回
			if (fse.existsSync(filePath)) {
				res.end('file exist')
				return
			}
			// 切片目录不存在，则创建切片目录
			if (!fse.existsSync(chunkDir)) {
				await fse.mkdirs(chunkDir)
			}
			// 把文件切片移动到我们的切片文件夹中
			fse.move(chunk.path, path.resolve(chunkDir, hash))
			res.end('received file chunk')
		})
	}

	/**
	 * 验证文件是否已上传，如已上传，则不用上传，相当于秒传成功
	 * 如果文件不在服务器中，则返回已经上传在服务器中的切片数组
	 * @param {*} req 
	 * @param {*} res 
	 */
	async handleVerifyUpload(req, res) {
		const data = await resolvePost(req)
		const { fileHash, filename } = data
		const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${extractExt(filename)}`)
		if (fse.existsSync(filePath)) {
			res.end(
				JSON.stringify({
					shouldUpload: false
				})
			);
		} else {
			// 文件不在服务器中，计算一下，还缺多少个切片需要上传
			res.end(
				JSON.stringify({
					shouldUpload: true,
					uploadedList: await createUploadedList(fileHash)
				})
			);
		}
	}
}
