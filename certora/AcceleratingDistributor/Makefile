default: help

PATCH         = applyHarness.patch
CONTRACTS_DIR = ../../contracts
MUNGED_DIR = ./munged
AcceleratingDistributor_Origin = ../../contracts/AcceleratingDistributor.sol
AcceleratingDistributor_munged = ./munged/AcceleratingDistributor.sol

help:
	@echo "usage:"
	@echo "  make clean:  remove all generated files (those ignored by git)"
	@echo "  make $(MUNGED_DIR): create $(MUNGED_DIR) directory by applying the patch file to $(CONTRACTS_DIR)"
	@echo "  make record: record a new patch file capturing the differences between $(CONTRACTS_DIR) and $(MUNGED_DIR)"

munged:  $(wildcard $(CONTRACTS_DIR)/*.sol) $(PATCH)
	rm -rf $@
	cp -r $(CONTRACTS_DIR) $@
	patch -p0 -d $@ < $(PATCH)

record:
	diff -ruN $(AcceleratingDistributor_Origin) $(AcceleratingDistributor_munged) | sed 's+\$(AcceleratingDistributor_Origin)/++g' | sed 's+$(AcceleratingDistributor_munged)++g' > $(PATCH)

clean:
	git clean -fdX
	touch $(PATCH)