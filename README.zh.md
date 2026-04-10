# Sideload.js

纯前端ipa签名工具

## 安装/部署


<!-- TODO: deploy to cf flow -->
Deploy to Cloudflare worker.


本地部署（With Dockerfile）


## 功能

1. apple客户端模拟(by unicorn over wasm)
2. Team，证书管理（获取，删除，注册）
3. zsign wasm（ipa解包，签名）
4. usbmuxd over webusb + lockdownd SSL service握手 



## 感谢

1. libimobiledevice
2. https://github.com/hack-different/webmuxd
3. zsign
4. openssl-wasm