.PHONY: dev build docker-build kind-load deploy copy-dist clean

CONSOLE_IMAGE ?= kubernaut-demo-console:latest
KIND_CLUSTER ?= kubernaut-demo
NAMESPACE ?= kubernaut-system

dev:
	npm run dev

build:
	npm run build

docker-build:
	docker build -t $(CONSOLE_IMAGE) .

kind-load: docker-build
	kind load docker-image $(CONSOLE_IMAGE) --name $(KIND_CLUSTER)

deploy:
	kubectl apply -f deploy/kind/oauth2-proxy.yaml
	kubectl rollout status deployment/kubernaut-console -n $(NAMESPACE) --timeout=120s
	@echo ""
	@echo "Console deployed. Access via: http://localhost:4180"
	@echo "NOTE: Add http://localhost:4180/oauth2/callback to Dex redirectURIs"

copy-dist: build
	$(eval POD := $(shell kubectl get pods -n $(NAMESPACE) -l app.kubernetes.io/name=kubernaut-console -o jsonpath='{.items[0].metadata.name}'))
	kubectl cp dist/ $(NAMESPACE)/$(POD):/usr/share/nginx/html/ -c nginx
	@echo "Static files copied to nginx sidecar."

clean:
	rm -rf dist node_modules
