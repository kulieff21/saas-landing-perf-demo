// Mobile menu, FAQ accordion, scroll reveal and the demo sign-up form.
// No dependencies; the page is fully usable without this file.

// Scroll-reveal styles only apply once this script has run (see styles.css).
document.documentElement.classList.add("js")

const menu = document.getElementById("collapsed-header-items")
const menuBtn = document.getElementById("collapse-btn")
const desktop = window.matchMedia("(min-width: 1024px)")

function setMenu(open) {
    menu.classList.toggle("is-open", open)
    menuBtn.setAttribute("aria-expanded", String(open))
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu")
    menuBtn.querySelector(".icon-open").hidden = open
    menuBtn.querySelector(".icon-close").hidden = !open
}

menuBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    setMenu(!menu.classList.contains("is-open"))
})
menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setMenu(false)
})
document.addEventListener("click", (e) => {
    if (menu.classList.contains("is-open") && !menu.contains(e.target)) setMenu(false)
})
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.classList.contains("is-open")) {
        setMenu(false)
        menuBtn.focus()
    }
})
desktop.addEventListener("change", () => setMenu(false))

document.querySelectorAll(".faq-accordion").forEach((btn) => {
    btn.addEventListener("click", () => {
        const item = btn.closest(".faq")
        const open = !item.classList.contains("open")
        item.classList.toggle("open", open)
        btn.setAttribute("aria-expanded", String(open))
    })
})

const reveal = document.querySelectorAll(".reveal-up")
if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue
                entry.target.classList.add("is-visible")
                io.unobserve(entry.target)
            }
        },
        { rootMargin: "0px 0px -10% 0px" }
    )
    reveal.forEach((el) => io.observe(el))
} else {
    reveal.forEach((el) => el.classList.add("is-visible"))
}

const form = document.getElementById("signup-form")
form.addEventListener("submit", (e) => {
    e.preventDefault()
    const email = form.elements.email
    const status = form.querySelector(".form-status")
    if (!email.checkValidity()) {
        status.textContent = "Please enter a valid email address."
        email.setAttribute("aria-invalid", "true")
        email.focus()
        return
    }
    email.removeAttribute("aria-invalid")
    status.textContent = "Thanks! This is a demo, so nothing was sent."
    form.reset()
})
