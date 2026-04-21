import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Global teardown runs once after all tests complete.
 * Disables test mode so the app uses real AI generation.
 */
async function globalTeardown() {
  try {
    execSync('npx convex env set CONVEX_TEST_MODE=false', {
      cwd: resolve(__dirname, '../..'),
      stdio: 'pipe',
    })
    console.log('✅ Disabled CONVEX_TEST_MODE (set to false)')
  } catch (error) {
    console.warn('⚠️  Could not disable test mode:', error)
  }
}

export default globalTeardown
