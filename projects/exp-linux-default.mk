#
#   exp-linux-default.mk -- Makefile to build Embedthis Expansive for linux
#

NAME                  := exp
VERSION               := 0.4.0
PROFILE               ?= default
ARCH                  ?= $(shell uname -m | sed 's/i.86/x86/;s/x86_64/x64/;s/arm.*/arm/;s/mips.*/mips/')
CC_ARCH               ?= $(shell echo $(ARCH) | sed 's/x86/i686/;s/x64/x86_64/')
OS                    ?= linux
CC                    ?= gcc
CONFIG                ?= $(OS)-$(ARCH)-$(PROFILE)
BUILD                 ?= build/$(CONFIG)
LBIN                  ?= $(BUILD)/bin
PATH                  := $(LBIN):$(PATH)

ME_COM_EJS            ?= 1
ME_COM_EST            ?= 1
ME_COM_HTTP           ?= 1
ME_COM_OPENSSL        ?= 0
ME_COM_OSDEP          ?= 1
ME_COM_PCRE           ?= 1
ME_COM_SQLITE         ?= 0
ME_COM_SSL            ?= 1
ME_COM_VXWORKS        ?= 0
ME_COM_WINSDK         ?= 1
ME_COM_ZLIB           ?= 1

ifeq ($(ME_COM_EST),1)
    ME_COM_SSL := 1
endif
ifeq ($(ME_COM_OPENSSL),1)
    ME_COM_SSL := 1
endif
ifeq ($(ME_COM_EJS),1)
    ME_COM_ZLIB := 1
endif

ME_COM_COMPILER_PATH  ?= gcc
ME_COM_LIB_PATH       ?= ar
ME_COM_OPENSSL_PATH   ?= /usr/src/openssl

CFLAGS                += -fPIC -w
DFLAGS                += -D_REENTRANT -DPIC $(patsubst %,-D%,$(filter ME_%,$(MAKEFLAGS))) -DME_COM_EJS=$(ME_COM_EJS) -DME_COM_EST=$(ME_COM_EST) -DME_COM_HTTP=$(ME_COM_HTTP) -DME_COM_OPENSSL=$(ME_COM_OPENSSL) -DME_COM_OSDEP=$(ME_COM_OSDEP) -DME_COM_PCRE=$(ME_COM_PCRE) -DME_COM_SQLITE=$(ME_COM_SQLITE) -DME_COM_SSL=$(ME_COM_SSL) -DME_COM_VXWORKS=$(ME_COM_VXWORKS) -DME_COM_WINSDK=$(ME_COM_WINSDK) -DME_COM_ZLIB=$(ME_COM_ZLIB) 
IFLAGS                += "-Ibuild/$(CONFIG)/inc"
LDFLAGS               += '-rdynamic' '-Wl,--enable-new-dtags' '-Wl,-rpath,$$ORIGIN/'
LIBPATHS              += -Lbuild/$(CONFIG)/bin
LIBS                  += -lrt -ldl -lpthread -lm

DEBUG                 ?= debug
CFLAGS-debug          ?= -g
DFLAGS-debug          ?= -DME_DEBUG
LDFLAGS-debug         ?= -g
DFLAGS-release        ?= 
CFLAGS-release        ?= -O2
LDFLAGS-release       ?= 
CFLAGS                += $(CFLAGS-$(DEBUG))
DFLAGS                += $(DFLAGS-$(DEBUG))
LDFLAGS               += $(LDFLAGS-$(DEBUG))

ME_ROOT_PREFIX        ?= 
ME_BASE_PREFIX        ?= $(ME_ROOT_PREFIX)/usr/local
ME_DATA_PREFIX        ?= $(ME_ROOT_PREFIX)/
ME_STATE_PREFIX       ?= $(ME_ROOT_PREFIX)/var
ME_APP_PREFIX         ?= $(ME_BASE_PREFIX)/lib/$(NAME)
ME_VAPP_PREFIX        ?= $(ME_APP_PREFIX)/$(VERSION)
ME_BIN_PREFIX         ?= $(ME_ROOT_PREFIX)/usr/local/bin
ME_INC_PREFIX         ?= $(ME_ROOT_PREFIX)/usr/local/include
ME_LIB_PREFIX         ?= $(ME_ROOT_PREFIX)/usr/local/lib
ME_MAN_PREFIX         ?= $(ME_ROOT_PREFIX)/usr/local/share/man
ME_SBIN_PREFIX        ?= $(ME_ROOT_PREFIX)/usr/local/sbin
ME_ETC_PREFIX         ?= $(ME_ROOT_PREFIX)/etc/$(NAME)
ME_WEB_PREFIX         ?= $(ME_ROOT_PREFIX)/var/www/$(NAME)-default
ME_LOG_PREFIX         ?= $(ME_ROOT_PREFIX)/var/log/$(NAME)
ME_SPOOL_PREFIX       ?= $(ME_ROOT_PREFIX)/var/spool/$(NAME)
ME_CACHE_PREFIX       ?= $(ME_ROOT_PREFIX)/var/spool/$(NAME)/cache
ME_SRC_PREFIX         ?= $(ME_ROOT_PREFIX)$(NAME)-$(VERSION)


ifeq ($(ME_COM_EJS),1)
    TARGETS           += build/$(CONFIG)/bin/ejs.mod
endif
ifeq ($(ME_COM_EJS),1)
    TARGETS           += build/$(CONFIG)/bin/ejs
endif
TARGETS               += build/$(CONFIG)/bin/exp
TARGETS               += build/$(CONFIG)/bin/exp.sample
TARGETS               += build/$(CONFIG)/bin/ca.crt
ifeq ($(ME_COM_HTTP),1)
    TARGETS           += build/$(CONFIG)/bin/http
endif
ifeq ($(ME_COM_EST),1)
    TARGETS           += build/$(CONFIG)/bin/libest.so
endif
TARGETS               += build/$(CONFIG)/bin/libmprssl.so

unexport CDPATH

ifndef SHOW
.SILENT:
endif

all build compile: prep $(TARGETS)

.PHONY: prep

prep:
	@echo "      [Info] Use "make SHOW=1" to trace executed commands."
	@if [ "$(CONFIG)" = "" ] ; then echo WARNING: CONFIG not set ; exit 255 ; fi
	@if [ "$(ME_APP_PREFIX)" = "" ] ; then echo WARNING: ME_APP_PREFIX not set ; exit 255 ; fi
	@[ ! -x $(BUILD)/bin ] && mkdir -p $(BUILD)/bin; true
	@[ ! -x $(BUILD)/inc ] && mkdir -p $(BUILD)/inc; true
	@[ ! -x $(BUILD)/obj ] && mkdir -p $(BUILD)/obj; true
	@[ ! -f $(BUILD)/inc/me.h ] && cp projects/exp-linux-default-me.h $(BUILD)/inc/me.h ; true
	@if ! diff $(BUILD)/inc/me.h projects/exp-linux-default-me.h >/dev/null ; then\
		cp projects/exp-linux-default-me.h $(BUILD)/inc/me.h  ; \
	fi; true
	@if [ -f "$(BUILD)/.makeflags" ] ; then \
		if [ "$(MAKEFLAGS)" != "`cat $(BUILD)/.makeflags`" ] ; then \
			echo "   [Warning] Make flags have changed since the last build: "`cat $(BUILD)/.makeflags`"" ; \
		fi ; \
	fi
	@echo $(MAKEFLAGS) >$(BUILD)/.makeflags

clean:
	rm -f "build/$(CONFIG)/obj/ejs.o"
	rm -f "build/$(CONFIG)/obj/ejsLib.o"
	rm -f "build/$(CONFIG)/obj/ejsc.o"
	rm -f "build/$(CONFIG)/obj/estLib.o"
	rm -f "build/$(CONFIG)/obj/exp.o"
	rm -f "build/$(CONFIG)/obj/expTemplate.o"
	rm -f "build/$(CONFIG)/obj/http.o"
	rm -f "build/$(CONFIG)/obj/httpLib.o"
	rm -f "build/$(CONFIG)/obj/mprLib.o"
	rm -f "build/$(CONFIG)/obj/mprSsl.o"
	rm -f "build/$(CONFIG)/obj/pcre.o"
	rm -f "build/$(CONFIG)/obj/zlib.o"
	rm -f "build/$(CONFIG)/bin/ejsc"
	rm -f "build/$(CONFIG)/bin/ejs"
	rm -f "build/$(CONFIG)/bin/exp"
	rm -f "build/$(CONFIG)/bin/ca.crt"
	rm -f "build/$(CONFIG)/bin/http"
	rm -f "build/$(CONFIG)/bin/libejs.so"
	rm -f "build/$(CONFIG)/bin/libest.so"
	rm -f "build/$(CONFIG)/bin/libhttp.so"
	rm -f "build/$(CONFIG)/bin/libmpr.so"
	rm -f "build/$(CONFIG)/bin/libmprssl.so"
	rm -f "build/$(CONFIG)/bin/libpcre.so"
	rm -f "build/$(CONFIG)/bin/libzlib.so"

clobber: clean
	rm -fr ./$(BUILD)


#
#   mpr.h
#
build/$(CONFIG)/inc/mpr.h: $(DEPS_1)
	@echo '      [Copy] build/$(CONFIG)/inc/mpr.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/mpr/mpr.h build/$(CONFIG)/inc/mpr.h

#
#   me.h
#
build/$(CONFIG)/inc/me.h: $(DEPS_2)
	@echo '      [Copy] build/$(CONFIG)/inc/me.h'

#
#   osdep.h
#
build/$(CONFIG)/inc/osdep.h: $(DEPS_3)
	@echo '      [Copy] build/$(CONFIG)/inc/osdep.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/osdep/osdep.h build/$(CONFIG)/inc/osdep.h

#
#   mprLib.o
#
DEPS_4 += build/$(CONFIG)/inc/me.h
DEPS_4 += build/$(CONFIG)/inc/mpr.h
DEPS_4 += build/$(CONFIG)/inc/osdep.h

build/$(CONFIG)/obj/mprLib.o: \
    src/paks/mpr/mprLib.c $(DEPS_4)
	@echo '   [Compile] build/$(CONFIG)/obj/mprLib.o'
	$(CC) -c -o build/$(CONFIG)/obj/mprLib.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/paks/mpr/mprLib.c

#
#   libmpr
#
DEPS_5 += build/$(CONFIG)/inc/mpr.h
DEPS_5 += build/$(CONFIG)/inc/me.h
DEPS_5 += build/$(CONFIG)/inc/osdep.h
DEPS_5 += build/$(CONFIG)/obj/mprLib.o

build/$(CONFIG)/bin/libmpr.so: $(DEPS_5)
	@echo '      [Link] build/$(CONFIG)/bin/libmpr.so'
	$(CC) -shared -o build/$(CONFIG)/bin/libmpr.so $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/mprLib.o" $(LIBS) 

#
#   pcre.h
#
build/$(CONFIG)/inc/pcre.h: $(DEPS_6)
	@echo '      [Copy] build/$(CONFIG)/inc/pcre.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/pcre/pcre.h build/$(CONFIG)/inc/pcre.h

#
#   pcre.o
#
DEPS_7 += build/$(CONFIG)/inc/me.h
DEPS_7 += build/$(CONFIG)/inc/pcre.h

build/$(CONFIG)/obj/pcre.o: \
    src/paks/pcre/pcre.c $(DEPS_7)
	@echo '   [Compile] build/$(CONFIG)/obj/pcre.o'
	$(CC) -c -o build/$(CONFIG)/obj/pcre.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/paks/pcre/pcre.c

ifeq ($(ME_COM_PCRE),1)
#
#   libpcre
#
DEPS_8 += build/$(CONFIG)/inc/pcre.h
DEPS_8 += build/$(CONFIG)/inc/me.h
DEPS_8 += build/$(CONFIG)/obj/pcre.o

build/$(CONFIG)/bin/libpcre.so: $(DEPS_8)
	@echo '      [Link] build/$(CONFIG)/bin/libpcre.so'
	$(CC) -shared -o build/$(CONFIG)/bin/libpcre.so $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/pcre.o" $(LIBS) 
endif

#
#   http.h
#
build/$(CONFIG)/inc/http.h: $(DEPS_9)
	@echo '      [Copy] build/$(CONFIG)/inc/http.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/http/http.h build/$(CONFIG)/inc/http.h

#
#   httpLib.o
#
DEPS_10 += build/$(CONFIG)/inc/me.h
DEPS_10 += build/$(CONFIG)/inc/http.h
DEPS_10 += build/$(CONFIG)/inc/mpr.h

build/$(CONFIG)/obj/httpLib.o: \
    src/paks/http/httpLib.c $(DEPS_10)
	@echo '   [Compile] build/$(CONFIG)/obj/httpLib.o'
	$(CC) -c -o build/$(CONFIG)/obj/httpLib.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/paks/http/httpLib.c

ifeq ($(ME_COM_HTTP),1)
#
#   libhttp
#
DEPS_11 += build/$(CONFIG)/inc/mpr.h
DEPS_11 += build/$(CONFIG)/inc/me.h
DEPS_11 += build/$(CONFIG)/inc/osdep.h
DEPS_11 += build/$(CONFIG)/obj/mprLib.o
DEPS_11 += build/$(CONFIG)/bin/libmpr.so
DEPS_11 += build/$(CONFIG)/inc/pcre.h
DEPS_11 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_11 += build/$(CONFIG)/bin/libpcre.so
endif
DEPS_11 += build/$(CONFIG)/inc/http.h
DEPS_11 += build/$(CONFIG)/obj/httpLib.o

LIBS_11 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_11 += -lpcre
endif

build/$(CONFIG)/bin/libhttp.so: $(DEPS_11)
	@echo '      [Link] build/$(CONFIG)/bin/libhttp.so'
	$(CC) -shared -o build/$(CONFIG)/bin/libhttp.so $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/httpLib.o" $(LIBPATHS_11) $(LIBS_11) $(LIBS_11) $(LIBS) 
endif

#
#   zlib.h
#
build/$(CONFIG)/inc/zlib.h: $(DEPS_12)
	@echo '      [Copy] build/$(CONFIG)/inc/zlib.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/zlib/zlib.h build/$(CONFIG)/inc/zlib.h

#
#   zlib.o
#
DEPS_13 += build/$(CONFIG)/inc/me.h
DEPS_13 += build/$(CONFIG)/inc/zlib.h

build/$(CONFIG)/obj/zlib.o: \
    src/paks/zlib/zlib.c $(DEPS_13)
	@echo '   [Compile] build/$(CONFIG)/obj/zlib.o'
	$(CC) -c -o build/$(CONFIG)/obj/zlib.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/paks/zlib/zlib.c

ifeq ($(ME_COM_ZLIB),1)
#
#   libzlib
#
DEPS_14 += build/$(CONFIG)/inc/zlib.h
DEPS_14 += build/$(CONFIG)/inc/me.h
DEPS_14 += build/$(CONFIG)/obj/zlib.o

build/$(CONFIG)/bin/libzlib.so: $(DEPS_14)
	@echo '      [Link] build/$(CONFIG)/bin/libzlib.so'
	$(CC) -shared -o build/$(CONFIG)/bin/libzlib.so $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/zlib.o" $(LIBS) 
endif

#
#   ejs.h
#
build/$(CONFIG)/inc/ejs.h: $(DEPS_15)
	@echo '      [Copy] build/$(CONFIG)/inc/ejs.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/ejs/ejs.h build/$(CONFIG)/inc/ejs.h

#
#   ejs.slots.h
#
build/$(CONFIG)/inc/ejs.slots.h: $(DEPS_16)
	@echo '      [Copy] build/$(CONFIG)/inc/ejs.slots.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/ejs/ejs.slots.h build/$(CONFIG)/inc/ejs.slots.h

#
#   ejsByteGoto.h
#
build/$(CONFIG)/inc/ejsByteGoto.h: $(DEPS_17)
	@echo '      [Copy] build/$(CONFIG)/inc/ejsByteGoto.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/ejs/ejsByteGoto.h build/$(CONFIG)/inc/ejsByteGoto.h

#
#   ejsLib.o
#
DEPS_18 += build/$(CONFIG)/inc/me.h
DEPS_18 += build/$(CONFIG)/inc/ejs.h
DEPS_18 += build/$(CONFIG)/inc/mpr.h
DEPS_18 += build/$(CONFIG)/inc/pcre.h
DEPS_18 += build/$(CONFIG)/inc/osdep.h
DEPS_18 += build/$(CONFIG)/inc/http.h
DEPS_18 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_18 += build/$(CONFIG)/inc/zlib.h

build/$(CONFIG)/obj/ejsLib.o: \
    src/paks/ejs/ejsLib.c $(DEPS_18)
	@echo '   [Compile] build/$(CONFIG)/obj/ejsLib.o'
	$(CC) -c -o build/$(CONFIG)/obj/ejsLib.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/paks/ejs/ejsLib.c

ifeq ($(ME_COM_EJS),1)
#
#   libejs
#
DEPS_19 += build/$(CONFIG)/inc/mpr.h
DEPS_19 += build/$(CONFIG)/inc/me.h
DEPS_19 += build/$(CONFIG)/inc/osdep.h
DEPS_19 += build/$(CONFIG)/obj/mprLib.o
DEPS_19 += build/$(CONFIG)/bin/libmpr.so
DEPS_19 += build/$(CONFIG)/inc/pcre.h
DEPS_19 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_19 += build/$(CONFIG)/bin/libpcre.so
endif
DEPS_19 += build/$(CONFIG)/inc/http.h
DEPS_19 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_19 += build/$(CONFIG)/bin/libhttp.so
endif
DEPS_19 += build/$(CONFIG)/inc/zlib.h
DEPS_19 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_19 += build/$(CONFIG)/bin/libzlib.so
endif
DEPS_19 += build/$(CONFIG)/inc/ejs.h
DEPS_19 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_19 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_19 += build/$(CONFIG)/obj/ejsLib.o

ifeq ($(ME_COM_HTTP),1)
    LIBS_19 += -lhttp
endif
LIBS_19 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_19 += -lpcre
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_19 += -lzlib
endif

build/$(CONFIG)/bin/libejs.so: $(DEPS_19)
	@echo '      [Link] build/$(CONFIG)/bin/libejs.so'
	$(CC) -shared -o build/$(CONFIG)/bin/libejs.so $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/ejsLib.o" $(LIBPATHS_19) $(LIBS_19) $(LIBS_19) $(LIBS) 
endif

#
#   ejsc.o
#
DEPS_20 += build/$(CONFIG)/inc/me.h
DEPS_20 += build/$(CONFIG)/inc/ejs.h

build/$(CONFIG)/obj/ejsc.o: \
    src/paks/ejs/ejsc.c $(DEPS_20)
	@echo '   [Compile] build/$(CONFIG)/obj/ejsc.o'
	$(CC) -c -o build/$(CONFIG)/obj/ejsc.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/paks/ejs/ejsc.c

ifeq ($(ME_COM_EJS),1)
#
#   ejsc
#
DEPS_21 += build/$(CONFIG)/inc/mpr.h
DEPS_21 += build/$(CONFIG)/inc/me.h
DEPS_21 += build/$(CONFIG)/inc/osdep.h
DEPS_21 += build/$(CONFIG)/obj/mprLib.o
DEPS_21 += build/$(CONFIG)/bin/libmpr.so
DEPS_21 += build/$(CONFIG)/inc/pcre.h
DEPS_21 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_21 += build/$(CONFIG)/bin/libpcre.so
endif
DEPS_21 += build/$(CONFIG)/inc/http.h
DEPS_21 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_21 += build/$(CONFIG)/bin/libhttp.so
endif
DEPS_21 += build/$(CONFIG)/inc/zlib.h
DEPS_21 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_21 += build/$(CONFIG)/bin/libzlib.so
endif
DEPS_21 += build/$(CONFIG)/inc/ejs.h
DEPS_21 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_21 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_21 += build/$(CONFIG)/obj/ejsLib.o
DEPS_21 += build/$(CONFIG)/bin/libejs.so
DEPS_21 += build/$(CONFIG)/obj/ejsc.o

LIBS_21 += -lejs
ifeq ($(ME_COM_HTTP),1)
    LIBS_21 += -lhttp
endif
LIBS_21 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_21 += -lpcre
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_21 += -lzlib
endif

build/$(CONFIG)/bin/ejsc: $(DEPS_21)
	@echo '      [Link] build/$(CONFIG)/bin/ejsc'
	$(CC) -o build/$(CONFIG)/bin/ejsc $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/ejsc.o" $(LIBPATHS_21) $(LIBS_21) $(LIBS_21) $(LIBS) $(LIBS) 
endif

ifeq ($(ME_COM_EJS),1)
#
#   ejs.mod
#
DEPS_22 += src/paks/ejs/ejs.es
DEPS_22 += build/$(CONFIG)/inc/mpr.h
DEPS_22 += build/$(CONFIG)/inc/me.h
DEPS_22 += build/$(CONFIG)/inc/osdep.h
DEPS_22 += build/$(CONFIG)/obj/mprLib.o
DEPS_22 += build/$(CONFIG)/bin/libmpr.so
DEPS_22 += build/$(CONFIG)/inc/pcre.h
DEPS_22 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_22 += build/$(CONFIG)/bin/libpcre.so
endif
DEPS_22 += build/$(CONFIG)/inc/http.h
DEPS_22 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_22 += build/$(CONFIG)/bin/libhttp.so
endif
DEPS_22 += build/$(CONFIG)/inc/zlib.h
DEPS_22 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_22 += build/$(CONFIG)/bin/libzlib.so
endif
DEPS_22 += build/$(CONFIG)/inc/ejs.h
DEPS_22 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_22 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_22 += build/$(CONFIG)/obj/ejsLib.o
DEPS_22 += build/$(CONFIG)/bin/libejs.so
DEPS_22 += build/$(CONFIG)/obj/ejsc.o
DEPS_22 += build/$(CONFIG)/bin/ejsc

build/$(CONFIG)/bin/ejs.mod: $(DEPS_22)
	( \
	cd src/paks/ejs; \
	../../../$(LBIN)/ejsc --out ../../../build/$(CONFIG)/bin/ejs.mod --optimize 9 --bind --require null ejs.es ; \
	)
endif

#
#   ejs.o
#
DEPS_23 += build/$(CONFIG)/inc/me.h
DEPS_23 += build/$(CONFIG)/inc/ejs.h

build/$(CONFIG)/obj/ejs.o: \
    src/paks/ejs/ejs.c $(DEPS_23)
	@echo '   [Compile] build/$(CONFIG)/obj/ejs.o'
	$(CC) -c -o build/$(CONFIG)/obj/ejs.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/paks/ejs/ejs.c

ifeq ($(ME_COM_EJS),1)
#
#   ejscmd
#
DEPS_24 += build/$(CONFIG)/inc/mpr.h
DEPS_24 += build/$(CONFIG)/inc/me.h
DEPS_24 += build/$(CONFIG)/inc/osdep.h
DEPS_24 += build/$(CONFIG)/obj/mprLib.o
DEPS_24 += build/$(CONFIG)/bin/libmpr.so
DEPS_24 += build/$(CONFIG)/inc/pcre.h
DEPS_24 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_24 += build/$(CONFIG)/bin/libpcre.so
endif
DEPS_24 += build/$(CONFIG)/inc/http.h
DEPS_24 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_24 += build/$(CONFIG)/bin/libhttp.so
endif
DEPS_24 += build/$(CONFIG)/inc/zlib.h
DEPS_24 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_24 += build/$(CONFIG)/bin/libzlib.so
endif
DEPS_24 += build/$(CONFIG)/inc/ejs.h
DEPS_24 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_24 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_24 += build/$(CONFIG)/obj/ejsLib.o
DEPS_24 += build/$(CONFIG)/bin/libejs.so
DEPS_24 += build/$(CONFIG)/obj/ejs.o

LIBS_24 += -lejs
ifeq ($(ME_COM_HTTP),1)
    LIBS_24 += -lhttp
endif
LIBS_24 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_24 += -lpcre
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_24 += -lzlib
endif

build/$(CONFIG)/bin/ejs: $(DEPS_24)
	@echo '      [Link] build/$(CONFIG)/bin/ejs'
	$(CC) -o build/$(CONFIG)/bin/ejs $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/ejs.o" $(LIBPATHS_24) $(LIBS_24) $(LIBS_24) $(LIBS) $(LIBS) 
endif


#
#   exp.h
#
build/$(CONFIG)/inc/exp.h: $(DEPS_25)
	@echo '      [Copy] build/$(CONFIG)/inc/exp.h'

#
#   exp.o
#
DEPS_26 += build/$(CONFIG)/inc/me.h
DEPS_26 += build/$(CONFIG)/inc/ejs.h
DEPS_26 += build/$(CONFIG)/inc/exp.h

build/$(CONFIG)/obj/exp.o: \
    src/exp.c $(DEPS_26)
	@echo '   [Compile] build/$(CONFIG)/obj/exp.o'
	$(CC) -c -o build/$(CONFIG)/obj/exp.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/exp.c

#
#   expTemplate.o
#
DEPS_27 += build/$(CONFIG)/inc/me.h
DEPS_27 += build/$(CONFIG)/inc/ejs.h
DEPS_27 += build/$(CONFIG)/inc/exp.h

build/$(CONFIG)/obj/expTemplate.o: \
    src/expTemplate.c $(DEPS_27)
	@echo '   [Compile] build/$(CONFIG)/obj/expTemplate.o'
	$(CC) -c -o build/$(CONFIG)/obj/expTemplate.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/expTemplate.c

#
#   exp
#
DEPS_28 += build/$(CONFIG)/inc/mpr.h
DEPS_28 += build/$(CONFIG)/inc/me.h
DEPS_28 += build/$(CONFIG)/inc/osdep.h
DEPS_28 += build/$(CONFIG)/obj/mprLib.o
DEPS_28 += build/$(CONFIG)/bin/libmpr.so
DEPS_28 += build/$(CONFIG)/inc/pcre.h
DEPS_28 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_28 += build/$(CONFIG)/bin/libpcre.so
endif
DEPS_28 += build/$(CONFIG)/inc/http.h
DEPS_28 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_28 += build/$(CONFIG)/bin/libhttp.so
endif
DEPS_28 += build/$(CONFIG)/inc/zlib.h
DEPS_28 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_28 += build/$(CONFIG)/bin/libzlib.so
endif
DEPS_28 += build/$(CONFIG)/inc/ejs.h
DEPS_28 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_28 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_28 += build/$(CONFIG)/obj/ejsLib.o
ifeq ($(ME_COM_EJS),1)
    DEPS_28 += build/$(CONFIG)/bin/libejs.so
endif
DEPS_28 += build/$(CONFIG)/obj/ejsc.o
ifeq ($(ME_COM_EJS),1)
    DEPS_28 += build/$(CONFIG)/bin/ejsc
endif
DEPS_28 += build/$(CONFIG)/bin/exp.mod
DEPS_28 += build/$(CONFIG)/inc/exp.h
DEPS_28 += build/$(CONFIG)/obj/exp.o
DEPS_28 += build/$(CONFIG)/obj/expTemplate.o

LIBS_28 += -lmpr
ifeq ($(ME_COM_HTTP),1)
    LIBS_28 += -lhttp
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_28 += -lpcre
endif
ifeq ($(ME_COM_EJS),1)
    LIBS_28 += -lejs
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_28 += -lzlib
endif

build/$(CONFIG)/bin/exp: $(DEPS_28)
	@echo '      [Link] build/$(CONFIG)/bin/exp'
	$(CC) -o build/$(CONFIG)/bin/exp $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/exp.o" "build/$(CONFIG)/obj/expTemplate.o" $(LIBPATHS_28) $(LIBS_28) $(LIBS_28) $(LIBS) $(LIBS) 

#
#   exp.sample
#
DEPS_29 += src/exp.sample

build/$(CONFIG)/bin/exp.sample: $(DEPS_29)
	( \
	cd .; \
	cp src/exp.sample build/$(CONFIG)/bin/exp.sample ; \
	)


#
#   http-ca-crt
#
DEPS_30 += src/paks/http/ca.crt

build/$(CONFIG)/bin/ca.crt: $(DEPS_30)
	@echo '      [Copy] build/$(CONFIG)/bin/ca.crt'
	mkdir -p "build/$(CONFIG)/bin"
	cp src/paks/http/ca.crt build/$(CONFIG)/bin/ca.crt

#
#   http.o
#
DEPS_31 += build/$(CONFIG)/inc/me.h
DEPS_31 += build/$(CONFIG)/inc/http.h

build/$(CONFIG)/obj/http.o: \
    src/paks/http/http.c $(DEPS_31)
	@echo '   [Compile] build/$(CONFIG)/obj/http.o'
	$(CC) -c -o build/$(CONFIG)/obj/http.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/paks/http/http.c

ifeq ($(ME_COM_HTTP),1)
#
#   httpcmd
#
DEPS_32 += build/$(CONFIG)/inc/mpr.h
DEPS_32 += build/$(CONFIG)/inc/me.h
DEPS_32 += build/$(CONFIG)/inc/osdep.h
DEPS_32 += build/$(CONFIG)/obj/mprLib.o
DEPS_32 += build/$(CONFIG)/bin/libmpr.so
DEPS_32 += build/$(CONFIG)/inc/pcre.h
DEPS_32 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_32 += build/$(CONFIG)/bin/libpcre.so
endif
DEPS_32 += build/$(CONFIG)/inc/http.h
DEPS_32 += build/$(CONFIG)/obj/httpLib.o
DEPS_32 += build/$(CONFIG)/bin/libhttp.so
DEPS_32 += build/$(CONFIG)/obj/http.o

LIBS_32 += -lhttp
LIBS_32 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_32 += -lpcre
endif

build/$(CONFIG)/bin/http: $(DEPS_32)
	@echo '      [Link] build/$(CONFIG)/bin/http'
	$(CC) -o build/$(CONFIG)/bin/http $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/http.o" $(LIBPATHS_32) $(LIBS_32) $(LIBS_32) $(LIBS) $(LIBS) 
endif

#
#   est.h
#
build/$(CONFIG)/inc/est.h: $(DEPS_33)
	@echo '      [Copy] build/$(CONFIG)/inc/est.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/est/est.h build/$(CONFIG)/inc/est.h

#
#   estLib.o
#
DEPS_34 += build/$(CONFIG)/inc/me.h
DEPS_34 += build/$(CONFIG)/inc/est.h
DEPS_34 += build/$(CONFIG)/inc/osdep.h

build/$(CONFIG)/obj/estLib.o: \
    src/paks/est/estLib.c $(DEPS_34)
	@echo '   [Compile] build/$(CONFIG)/obj/estLib.o'
	$(CC) -c -o build/$(CONFIG)/obj/estLib.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/paks/est/estLib.c

ifeq ($(ME_COM_EST),1)
#
#   libest
#
DEPS_35 += build/$(CONFIG)/inc/est.h
DEPS_35 += build/$(CONFIG)/inc/me.h
DEPS_35 += build/$(CONFIG)/inc/osdep.h
DEPS_35 += build/$(CONFIG)/obj/estLib.o

build/$(CONFIG)/bin/libest.so: $(DEPS_35)
	@echo '      [Link] build/$(CONFIG)/bin/libest.so'
	$(CC) -shared -o build/$(CONFIG)/bin/libest.so $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/estLib.o" $(LIBS) 
endif

#
#   mprSsl.o
#
DEPS_36 += build/$(CONFIG)/inc/me.h
DEPS_36 += build/$(CONFIG)/inc/mpr.h

build/$(CONFIG)/obj/mprSsl.o: \
    src/paks/mpr/mprSsl.c $(DEPS_36)
	@echo '   [Compile] build/$(CONFIG)/obj/mprSsl.o'
	$(CC) -c -o build/$(CONFIG)/obj/mprSsl.o $(CFLAGS) $(DFLAGS) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/paks/mpr/mprSsl.c

#
#   libmprssl
#
DEPS_37 += build/$(CONFIG)/inc/mpr.h
DEPS_37 += build/$(CONFIG)/inc/me.h
DEPS_37 += build/$(CONFIG)/inc/osdep.h
DEPS_37 += build/$(CONFIG)/obj/mprLib.o
DEPS_37 += build/$(CONFIG)/bin/libmpr.so
DEPS_37 += build/$(CONFIG)/inc/est.h
DEPS_37 += build/$(CONFIG)/obj/estLib.o
ifeq ($(ME_COM_EST),1)
    DEPS_37 += build/$(CONFIG)/bin/libest.so
endif
DEPS_37 += build/$(CONFIG)/obj/mprSsl.o

LIBS_37 += -lmpr
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_37 += -lssl
    LIBPATHS_37 += -L$(ME_COM_OPENSSL_PATH)
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_37 += -lcrypto
    LIBPATHS_37 += -L$(ME_COM_OPENSSL_PATH)
endif
ifeq ($(ME_COM_EST),1)
    LIBS_37 += -lest
endif

build/$(CONFIG)/bin/libmprssl.so: $(DEPS_37)
	@echo '      [Link] build/$(CONFIG)/bin/libmprssl.so'
	$(CC) -shared -o build/$(CONFIG)/bin/libmprssl.so $(LDFLAGS) $(LIBPATHS)  "build/$(CONFIG)/obj/mprSsl.o" $(LIBPATHS_37) $(LIBS_37) $(LIBS_37) $(LIBS) 

#
#   stop
#
stop: $(DEPS_38)

#
#   installBinary
#
installBinary: $(DEPS_39)
	( \
	cd .; \
	mkdir -p "$(ME_APP_PREFIX)" ; \
	rm -f "$(ME_APP_PREFIX)/latest" ; \
	ln -s "0.4.0" "$(ME_APP_PREFIX)/latest" ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	cp build/$(CONFIG)/bin/exp $(ME_VAPP_PREFIX)/bin/exp ; \
	mkdir -p "$(ME_BIN_PREFIX)" ; \
	rm -f "$(ME_BIN_PREFIX)/exp" ; \
	ln -s "$(ME_VAPP_PREFIX)/bin/exp" "$(ME_BIN_PREFIX)/exp" ; \
	cp build/$(CONFIG)/bin/libejs.so $(ME_VAPP_PREFIX)/bin/libejs.so ; \
	cp build/$(CONFIG)/bin/libhttp.so $(ME_VAPP_PREFIX)/bin/libhttp.so ; \
	cp build/$(CONFIG)/bin/libmpr.so $(ME_VAPP_PREFIX)/bin/libmpr.so ; \
	cp build/$(CONFIG)/bin/libmprssl.so $(ME_VAPP_PREFIX)/bin/libmprssl.so ; \
	cp build/$(CONFIG)/bin/libpcre.so $(ME_VAPP_PREFIX)/bin/libpcre.so ; \
	cp build/$(CONFIG)/bin/libzlib.so $(ME_VAPP_PREFIX)/bin/libzlib.so ; \
	if [ "$(ME_COM_EST)" = 1 ]; then true ; \
	cp build/$(CONFIG)/bin/libest.so $(ME_VAPP_PREFIX)/bin/libest.so ; \
	fi ; \
	if [ "$(ME_COM_OPENSSL)" = 1 ]; then true ; \
	cp build/$(CONFIG)/bin/libssl*.so* $(ME_VAPP_PREFIX)/bin/libssl*.so* ; \
	cp build/$(CONFIG)/bin/libcrypto*.so* $(ME_VAPP_PREFIX)/bin/libcrypto*.so* ; \
	fi ; \
	cp build/$(CONFIG)/bin/ca.crt $(ME_VAPP_PREFIX)/bin/ca.crt ; \
	cp build/$(CONFIG)/bin/ejs.mod $(ME_VAPP_PREFIX)/bin/ejs.mod ; \
	cp build/$(CONFIG)/bin/exp.mod $(ME_VAPP_PREFIX)/bin/exp.mod ; \
	cp build/$(CONFIG)/bin/exp.sample $(ME_VAPP_PREFIX)/bin/exp.sample ; \
	cp src/exp.es $(ME_VAPP_PREFIX)/bin/exp.es ; \
	cp src/exp.h $(ME_VAPP_PREFIX)/bin/exp.h ; \
	cp src/exp.mod $(ME_VAPP_PREFIX)/bin/exp.mod ; \
	cp src/exp.sample $(ME_VAPP_PREFIX)/bin/exp.sample ; \
	cp src/expTemplate.c $(ME_VAPP_PREFIX)/bin/expTemplate.c ; \
	cp src/ExpTemplate.es $(ME_VAPP_PREFIX)/bin/ExpTemplate.es ; \
	mkdir -p "$(ME_VAPP_PREFIX)/doc/man/man1" ; \
	cp doc/documents/man/exp.1 $(ME_VAPP_PREFIX)/doc/man/man1/exp.1 ; \
	mkdir -p "$(ME_MAN_PREFIX)/man1" ; \
	rm -f "$(ME_MAN_PREFIX)/man1/exp.1" ; \
	ln -s "$(ME_VAPP_PREFIX)/doc/man/man1/exp.1" "$(ME_MAN_PREFIX)/man1/exp.1" ; \
	)

#
#   start
#
start: $(DEPS_40)

#
#   install
#
DEPS_41 += stop
DEPS_41 += installBinary
DEPS_41 += start

install: $(DEPS_41)

#
#   uninstall
#
DEPS_42 += stop

uninstall: $(DEPS_42)
	( \
	cd .; \
	rm -fr "$(ME_VAPP_PREFIX)" ; \
	rm -f "$(ME_APP_PREFIX)/latest" ; \
	rmdir -p "$(ME_APP_PREFIX)" 2>/dev/null ; true ; \
	)

#
#   version
#
version: $(DEPS_43)
	echo 0.4.0

