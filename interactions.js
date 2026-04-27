document.body.classList.add("js-enabled");

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window && revealItems.length) {
  const onIntersect = (entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      entry.target.classList.add("in-view");
      obs.unobserve(entry.target);
    });
  };

  const observer = new IntersectionObserver(onIntersect, {
    threshold: 0,
    rootMargin: "0px",
  });

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("in-view"));
}
