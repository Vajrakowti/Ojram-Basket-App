(function () {
	function apply() {
		fetch('/api/home/branding')
			.then(function (r) {
				return r.json();
			})
			.then(function (b) {
				var url = b.header && b.header.logoUrl;
				if (!url) return;
				var name = (b.appName || 'VV Farms') + ' Logo';
				document.querySelectorAll('img[src="/Logo.jpg"]').forEach(function (img) {
					img.src = url;
					img.alt = name;
				});
			})
			.catch(function () {});
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', apply);
	} else {
		apply();
	}
})();
