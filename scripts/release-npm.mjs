console.error(`正式 npm 发布统一通过 GitHub Actions 的 Publish npm packages 工作流（main）。
本地发布前验证：pnpm check:release
发布入口：https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions/workflows/npm-publish.yml
本命令未上传包或创建 tag。`);
process.exitCode = 1;
