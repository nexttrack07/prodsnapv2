import { defineApp } from 'convex/server'
import workflow from '@convex-dev/workflow/convex.config.js'
import workpool from '@convex-dev/workpool/convex.config.js'

const app = defineApp()
app.use(workflow)
app.use(workpool, { name: 'imageGenPool' })
app.use(workpool, { name: 'ingestPool' })

export default app
