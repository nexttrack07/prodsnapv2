/**
 * Layout for /products and its children. The actual /products grid lives in
 * products.index.tsx; /products/new lives in products.new.tsx. Both render
 * through this layout's <Outlet />.
 */
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/products')({
  component: ProductsLayout,
})

function ProductsLayout() {
  return <Outlet />
}
