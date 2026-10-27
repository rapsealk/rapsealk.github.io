import * as React from "react"
import { Link, graphql } from "gatsby"

import Bio from "../components/bio"
import Layout from "../components/layout"
import Seo from "../components/seo"

const POSTS_PER_PAGE = 6

const BlogIndex = ({ data, location }) => {
  const siteTitle = data.site.siteMetadata?.title || `Title`
  const posts = data.allMarkdownRemark.nodes
  const [visibleCount, setVisibleCount] = React.useState(POSTS_PER_PAGE)
  const hasMorePosts = visibleCount < posts.length

  if (posts.length === 0) {
    return (
      <Layout location={location} title={siteTitle}>
        <Bio />
        <p>
          No blog posts found. Add markdown posts to "content/blog" (or the
          directory you specified for the "gatsby-source-filesystem" plugin in
          gatsby-config.js).
        </p>
      </Layout>
    )
  }

  return (
    <Layout location={location} title={siteTitle}>
      <Bio />
      <ol style={{ listStyle: `none` }}>
        {posts.map((post, index) => {
          const title = post.frontmatter.title || post.fields.slug
          const isHidden = index >= visibleCount

          return (
            <li key={post.fields.slug} hidden={isHidden}>
              <article
                className="post-list-item"
                itemScope
                itemType="http://schema.org/Article"
              >
                <header>
                  <h2>
                    <Link to={post.fields.slug} itemProp="url">
                      <span itemProp="headline">{title}</span>
                    </Link>
                  </h2>
                  <small>{post.frontmatter.date}</small>
                </header>
                <section>
                  <p
                    dangerouslySetInnerHTML={{
                      __html: post.frontmatter.description || post.excerpt,
                    }}
                    itemProp="description"
                  />
                </section>
              </article>
            </li>
          )
        })}
      </ol>
      <p className="visually-hidden" aria-live="polite">
        {`게시글 ${Math.min(visibleCount, posts.length)}개 표시 중`}
      </p>
      {posts.length > POSTS_PER_PAGE && (
        <button
          type="button"
          className="load-more-button"
          aria-label={
            hasMorePosts
              ? `이전 게시글 ${Math.min(
                  POSTS_PER_PAGE,
                  posts.length - visibleCount
                )}개 더 보기`
              : undefined
          }
          aria-disabled={!hasMorePosts}
          onClick={() => {
            if (hasMorePosts) {
              setVisibleCount(count =>
                Math.min(count + POSTS_PER_PAGE, posts.length)
              )
            }
          }}
        >
          {hasMorePosts ? "더 보기" : "모든 게시글을 표시했습니다"}
        </button>
      )}
    </Layout>
  )
}

export default BlogIndex

/**
 * Head export to define metadata for the page
 *
 * See: https://www.gatsbyjs.com/docs/reference/built-in-components/gatsby-head/
 */
export const Head = () => <Seo title="All posts" />

export const pageQuery = graphql`
  {
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(sort: { frontmatter: { date: DESC } }) {
      nodes {
        excerpt
        fields {
          slug
        }
        frontmatter {
          date(formatString: "MMMM DD, YYYY")
          title
          description
        }
      }
    }
  }
`
