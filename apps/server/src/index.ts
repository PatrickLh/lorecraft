/** 服务入口：仅绑定本地地址（plan §3）。 */
import { serve } from '@hono/node-server'
import { openDb } from './db.js'
import { loadConfig, loadDotEnv } from './config.js'
import { GameService } from './game.js'
import { createProvider } from './provider-factory.js'
import { Repos } from './repos.js'
import { createApp } from './routes.js'

const envFile = loadDotEnv()
if (envFile) console.log(`[lorecraft] loaded env from ${envFile}`)

const config = loadConfig()
const db = openDb(config.sqlitePath)
const repos = new Repos(db)
const provider = createProvider(config)
const service = new GameService({ db, config, provider, repos })
const app = createApp(service)

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(
    `[lorecraft] server listening on http://${info.address}:${info.port} (provider=${config.provider}, model=${provider.model})`
  )
})
