import '../style.css'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import renderMathInElement from 'katex/contrib/auto-render'
import hljs from 'highlight.js/lib/core'
import glsl from 'highlight.js/lib/languages/glsl'

// 数式は KaTeX の auto-render で、\( \) をインライン、\[ \] を別行立てにする。コードは highlight.js の GLSL
hljs.registerLanguage('glsl', glsl)

const main = document.querySelector('main') as HTMLElement
renderMathInElement(main, {
  delimiters: [
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false },
  ],
  throwOnError: false,
})
main.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el as HTMLElement))
