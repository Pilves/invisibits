const buttons = document.querySelectorAll('.tabs button')

buttons.forEach(button => {
  button.addEventListener('click', () => {
    const clicked = button.getAttribute('data-tab')
    const sections = document.querySelectorAll('[data-tab-content]')
    sections.forEach(section => {
      section.setAttribute('hidden', '')
    });
    const match = document.querySelector(`[data-tab-content="${clicked}"]`)
    match.removeAttribute('hidden')

    buttons.forEach(btn => btn.classList.remove('active'))
    button.classList.add('active')
  })
})
