<template>
  <fc-china></fc-china>
  <p>文件上传</p>

  <div class="container">
  	<input type="file" @change="handleFileChange">
  	<br><br>
  	<fc-typing-input placeholder="选择文件"></fc-typing-input>
  	<br><br>
  	<fc-underline-btn @click.stop="handleUpload">上传</fc-underline-btn>
    <br><br>
    <span>计算文件hash进度： {{hashPercentage}}</span>
  	<br><br>
    <span>上次进度：{{uploadPercentage}}</span>
  </div>
</template>

<script>
import { ref, reactive, computed } from 'vue'
const Status = {
	wait: 'wait',
	pause: 'pause',
	uploading: 'uploading'
}
const SIZE = 1000 * 1024
// 基于xhr封装的，用来发送请求的
function request({
  url,
  method = 'post',
  data,
  headers = {},
  onProgress = e => e,
  requestList
}) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = onProgress
    xhr.open(method, url)
    Object.keys(headers).forEach(key =>
      xhr.setRequestHeader(key, headers[key])
    )
    xhr.send(data)
    xhr.onload = e => {
      // 将请求成功的 xhr 从列表中删除
      if (requestList) {
        const xhrIndex = requestList.findIndex(item => item === xhr)
        requestList.splice(xhrIndex, 1)
      }
      resolve({
        data: e.target.response
      })
    };
    // 暴露当前 xhr 给外部
    requestList?.push(xhr)
  })
}

export default {
  name: 'App',
  setup(props, ctx) {
    const container = reactive({
    	file: null
    })
    const data = ref([])
    const status = ref(Status.wait)
    // 生成文件hash的进度
    const hashPercentage = ref(0)
    // 文件上传的进度
    const uploadPercentage = computed(() => {
      if (!container.file || !data.value.length) {
        return 0
      }
      // todo
      const loaded = data.value.map(item => {
        return item.size * item.percentage
      }).reduce((acc, cur) => {
        return acc + cur
      })
      return parseInt((loaded / container.file.size).toFixed(2))
    })

    function handleFileChange(e) {
    	const [file] = e.target.files;
      if (!file) return;
      // Object.assign(this.$data, this.$options.data());
      container.file = file;

      console.log(container.file, 111)

      // console.log(this, 123)
    }

    // 上传按钮
    async function handleUpload() {
    	if(!container.file) {
    		return
    	}
    	// 点了上传按钮，状态改为上传中...
    	status.value = Status.uploading
    	// 文件分片
    	const fileChunkList = createFileChunk(container.file)
    	console.log('文件分了多少片：', fileChunkList.length)
    	// 文件hash
    	container.hash = await calculateHash(fileChunkList)
    	console.log('文件hash是：', container.hash)

      const { shouldUpload } = await verifyUpload(container.file.name, container.file.hash)
      if(!shouldUpload) {
        console.log('秒传：上传成功')
        return
      }

    	data.value = fileChunkList.map(({ file }, index) => ({
    		fileHash: container.hash,
    		index,
    		hash: `${container.hash}-${index}`,
    		chunk: file,
    		size: file.size,
        percentage: 0
    	}))
    	uploadChunks(data.value)
    }

    /**
     * 根据文件内容生成hash，而不是根据文件名称生成hash
     * 考虑到如果上传一个超大文件，读取文件内容计算 hash 是非常耗费时间的，并且会引起 UI 的阻塞，
     * 导致页面假死状态，所以我们使用 web-worker 在 worker 线程计算 hash，这样用户仍可以在主界面正常的交互
     * @Author   Author
     * @DateTime 2021-12-31T14:19:59+0800
     * @param    {[type]}                 fileChunkList [description]
     * @return   {[type]}                               [description]
     */
    function calculateHash(fileChunkList) {
      return new Promise(resolve => {
        container.worker = new Worker('/hash.js')
        container.worker.postMessage({ fileChunkList })
        container.worker.onmessage = e => {
          const { percentage, hash } = e.data
          hashPercentage.value = percentage
          if (hash) {
            resolve(hash)
          }
        }
      })
    }

    // 生成文件切片
    function createFileChunk(file, size = SIZE) {
     const fileChunkList = [];
      let cur = 0;
      while (cur < file.size) {
        fileChunkList.push({ file: file.slice(cur, cur + size) });
        cur += size;
      }
      return fileChunkList;
    }

    // 上传切片
    // todo: 同时过滤已上传的切片
    async function uploadChunks(uploadedList = []) {
      const requestList = uploadedList.map(({ chunk, hash, index }) => {
        const formData = new FormData();
        // 切片文件
        formData.append('chunk', chunk);
        // 切片文件hash
        formData.append('hash', hash);
        // 大文件的文件名
        formData.append('filename', container.file.name);
        // 大文件hash
        formData.append('fileHash', container.hash)
        return { formData, index };
      })
      .map(async ({ formData, index }) =>
        request({
          url: 'http://localhost:9999',
          data: formData,
          onProgress: createProgressHandler(index, data.value[index])
        })
      )

      // 并发切片
      await Promise.all(requestList)
      // todo
      // 之前上传的切片数量 + 本次上传的切片数量 = 所有切片数量时
      

      // 切片并发上传完以后，发个请求告诉后端：合并切片
      mergeRequest()
    }

    /**
     * 上传切片进度的回调函数
     */
    function createProgressHandler(index, item) {
      // console.log('++++', index, '-', item)
      return e => {
        if(e.lengthComputable) {
          item.percentage = parseInt(String((e.loaded / e.total) * 100))
        }
      }
    }

    function verifyUpload(filename, fileHash) {
      const { data } = await request({
        url: 'http://localhost:9999/verify',
        headers: {
          "content-type": "application/json"
        },
        data: JSON.stringify({
          filename,
          fileHash
        })
      })
      return JSON.parse(data)
    }

    async function mergeRequest() {
    	await request({
    		url: "http://localhost:9999/merge",
    		headers: {
    			"content-type": "application/json"
    		},
    		data: JSON.stringify({
    			size: SIZE,
    			fileHash: container.hash,
    			filename: container.file.name
    		})
    	})
    	alert('上传成功')
    	status.value = Status.wait
    }



    return {
      hashPercentage,
      uploadPercentage,
      container,
      handleFileChange,
      handleUpload
    }
  }
}
</script>

<style scoped>
.container {
	margin-top: 50px;
	width: 600px;
	margin: 0 auto;
}
</style>
