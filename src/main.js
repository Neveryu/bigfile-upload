// import { FcTypingInput, FcChina, FcUnderlineBtn, FcArrowBtn, FcPixelBtn } from 'http://unpkg.zhimg.com/fancy-components'
import { FcTypingInput, FcChina, FcUnderlineBtn, FcArrowBtn, FcPixelBtn } from '../public/fance-components.js'
import { createApp } from 'vue'
import App from './App.vue'
import './index.css'

new FcTypingInput()
new FcChina()
new FcUnderlineBtn()
new FcArrowBtn()
new FcPixelBtn()

createApp(App).mount('#app')

/**
 * 关于fancy-components
 * https://juejin.cn/post/7013247812628381704
 * https://github.com/fancy-components/fancy-components/issues/2
 */