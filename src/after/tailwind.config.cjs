/** @type {import('tailwindcss').Config} */
module.exports = {
    prefix: "tw-",
    important: false,
    // `content` is set by tools/build.mjs to the rendered HTML and main.js.
    content: [],
    theme: {
        extend: {
            colors: {
                primary: "#7e22ce",
                secondary: "#080808",
                outlineColor: "#1F2123",
            },
        },
    },
    plugins: [],
}
