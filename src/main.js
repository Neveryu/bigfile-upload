import { FcTypingInput, FcChina, FcUnderlineBtn } from 'http://unpkg.zhimg.com/fancy-components'
import { createApp } from 'vue'
import App from './App.vue'
import './index.css'

new FcTypingInput()
new FcChina()
new FcUnderlineBtn()

createApp(App).mount('#app')
