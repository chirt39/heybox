# 本地 Milvus 恢复环境

此 Compose 配置仅用于本地恢复或迁移 Milvus 数据；当前应用后端使用嵌入式 Chroma，不会启动此服务。

## 设置本地 MinIO 凭据

MinIO 镜像版本为 `RELEASE.2024-12-18T13-15-44Z`，使用 `MINIO_ROOT_USER` 和 `MINIO_ROOT_PASSWORD`。Milvus 容器通过 `MINIO_ACCESS_KEY_ID` 和 `MINIO_SECRET_ACCESS_KEY` 使用同一组凭据。Compose 要求这些变量必须设置，不提供默认账号或密码。

从仓库根目录进入此目录，在本机创建权限受限的 `.env` 文件。下面命令生成随机用户名和密码；若文件已存在会停止，避免覆盖已有配置：

```sh
cd infra/milvus
if [ -e .env ] || [ -L .env ]; then
    echo ".env 已存在，请编辑现有本机文件，不要覆盖它。"
    exit 1
fi
umask 077
{
    printf 'MINIO_ROOT_USER=minio_%s\n' "$(openssl rand -hex 8)"
    printf 'MINIO_ROOT_PASSWORD=%s\n' "$(openssl rand -hex 24)"
} > .env
chmod 600 .env
```

`.env` 已被仓库忽略。不要提交凭据、把它们复制到示例文件，或在日志、截图和公开消息中分享。需要手动设置时，在 `infra/milvus/.env` 中填写 `MINIO_ROOT_USER` 与 `MINIO_ROOT_PASSWORD`；用户名至少 3 个字符，密码至少 8 个字符。

## 启动与端口边界

在本目录中执行：

```sh
docker compose up -d
docker compose ps
```

Milvus 的 `19530` 和 `9091` 仅绑定到主机 loopback（`127.0.0.1`）；MinIO 没有发布主机端口，只在 Compose 内部网络供 Milvus 使用。请保留这些端口边界，不要改成 `0.0.0.0` 或移除 loopback 绑定。

本地恢复或迁移完成后，可停止此栈：

```sh
docker compose down
```

该命令保留绑定挂载的数据目录；不要删除 `volumes/`，除非已确认数据不再需要并完成备份。
