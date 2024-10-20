---
layout: cv
permalink: /cv/
title: CV
nav: true
nav_order: 5
description: Download my CV here. Last updated on 2024-05-01.
toc:
  sidebar: left
redirect: true
---

<script>
  window.onload = function() {
    window.open("{{ site.baseurl }}/assets/pdf/HemantCV.pdf", "_blank");
    setTimeout(function() {
      window.location.href = "{{ site.baseurl }}"; // Redirect to the main page after 3 seconds
    }, 3000);
  };
</script>

<p>You will be redirected to the main page within 3 seconds. If not redirected, please go back to the [home page]({{ site.baseurl | prepend: site.url }}).</p>

