// Social crawlers (Facebook, LinkedIn, iMessage, …) require an ABSOLUTE
// og:image URL — a relative path silently fails to render. Resolve relative
// paths against the production origin.
const SITE_URL = 'https://prodsnap.io'

export const seo = ({
  title,
  description,
  keywords,
  image,
}: {
  title: string
  description?: string
  image?: string
  keywords?: string
}) => {
  const absoluteImage = image
    ? image.startsWith('http')
      ? image
      : `${SITE_URL}${image.startsWith('/') ? '' : '/'}${image}`
    : undefined

  const tags = [
    { title },
    { name: 'description', content: description },
    { name: 'keywords', content: keywords },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'og:type', content: 'website' },
    { name: 'og:title', content: title },
    { name: 'og:description', content: description },
    ...(absoluteImage
      ? [
          { name: 'twitter:image', content: absoluteImage },
          { name: 'twitter:card', content: 'summary_large_image' },
          { name: 'og:image', content: absoluteImage },
        ]
      : []),
  ]

  return tags
}
