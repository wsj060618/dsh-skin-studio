# dsh-skin-studio

给 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 加**背景图**和**毛玻璃蒙版**的增强插件。

> 一句话价值：给你的 Harness 换一张自己的背景图，再用蒙版虚化把它柔化 —— **颜色、文字、气泡等一切沿用原主题，不碰主题服务**。

## 功能

| 功能 | 说明 |
|---|---|
| 🖼️ 背景图 | 上传自己的图片铺在界面后面，支持「铺满 / 完整显示 / 平铺」三种适配 |
| 🌫️ 全局蒙版虚化 | 一张半透明蒙版 + `backdrop-filter` 毛玻璃，可分别调**浓度**（透明度）和**虚化程度**（模糊） |

打开后侧栏出现「皮肤工坊」入口，进去即可设置。

## 安装

> **推荐 · 插件市场**：打开 Harness → 设置 → 插件市场，搜索 `dsh-skin-studio` 安装。

或命令行（web profile）：

```bash
dsh plugin --profile web add github:wsj060618/dsh-skin-studio
```

或 npm 源：

```bash
dsh plugin --profile web add @wsj060618/dsh-skin-studio
```

或 tarball 安装：

```bash
npm pack
dsh plugin --profile web add ./wsj060618-dsh-skin-studio-0.1.0.tgz
```

## 使用

1. 侧栏打开「皮肤工坊」。
2. 「背景图」→ 选择图片；「适配方式」选铺满/完整显示/平铺。
3. 「全局蒙版虚化」→ 调「蒙版浓度」（0% 完全透明、100% 不透明）和「虚化程度」（0 不模糊）。
4. 切换浅色/深色主题时，蒙版会自动跟随当前主题的底色。

## 隐私

- 背景图只存在本机 `localStorage`，**不会上传**。
- 插件不访问网络、不读写文件系统之外的任何东西。

## 兼容性

- 依赖 `@deepseek-ai/dsh-client-ui-layout`（`slots` 服务）。
- 桌面版（Electron）验证通过；`platform: web`。

## License

[MIT](./LICENSE)
