// --- Tab switching ---
const tabButtons = document.querySelectorAll('.tabs button')

tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    const clicked = button.getAttribute('data-tab')
    const sections = document.querySelectorAll('[data-tab-content]')
    sections.forEach(section => {
      section.setAttribute('hidden', '')
    });
    const match = document.querySelector(`[data-tab-content="${clicked}"]`)
    match.removeAttribute('hidden')

    tabButtons.forEach(btn => btn.classList.remove('active'))
    button.classList.add('active')
  })
})

// --- Image / Audio mode toggle (on Encode and Decode tabs) ---
const toggleButtons = document.querySelectorAll('.toggle-button')

toggleButtons.forEach(button => {
  button.addEventListener('click', () => {
    const mode = button.getAttribute('data-mode')
    const target = button.getAttribute('data-target')

    // hide all mode panels for this tab, show the selected one
    const panels = document.querySelectorAll(`[data-${target}-mode]`)
    panels.forEach(panel => panel.setAttribute('hidden', ''))
    const selected = document.querySelector(`[data-${target}-mode="${mode}"]`)
    selected.removeAttribute('hidden')

    // update active state on toggle buttons for this tab
    const siblings = document.querySelectorAll(`.toggle-button[data-target="${target}"]`)
    siblings.forEach(btn => btn.classList.remove('active'))
    button.classList.add('active')
  })
})
