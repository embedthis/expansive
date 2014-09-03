#
#   exp-macosx-default.mk -- Makefile to build Embedthis Expansive for macosx
#

NAME                  := exp
VERSION               := 0.4.0
PROFILE               ?= default
ARCH                  ?= $(shell uname -m | sed 's/i.86/x86/;s/x86_64/x64/;s/arm.*/arm/;s/mips.*/mips/')
CC_ARCH               ?= $(shell echo $(ARCH) | sed 's/x86/i686/;s/x64/x86_64/')
OS                    ?= macosx
CC                    ?= clang
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

ME_COM_COMPILER_PATH  ?= clang
ME_COM_LIB_PATH       ?= ar
ME_COM_OPENSSL_PATH   ?= /usr/src/openssl

CFLAGS                += -g -w
DFLAGS                +=  $(patsubst %,-D%,$(filter ME_%,$(MAKEFLAGS))) -DME_COM_EJS=$(ME_COM_EJS) -DME_COM_EST=$(ME_COM_EST) -DME_COM_HTTP=$(ME_COM_HTTP) -DME_COM_OPENSSL=$(ME_COM_OPENSSL) -DME_COM_OSDEP=$(ME_COM_OSDEP) -DME_COM_PCRE=$(ME_COM_PCRE) -DME_COM_SQLITE=$(ME_COM_SQLITE) -DME_COM_SSL=$(ME_COM_SSL) -DME_COM_VXWORKS=$(ME_COM_VXWORKS) -DME_COM_WINSDK=$(ME_COM_WINSDK) -DME_COM_ZLIB=$(ME_COM_ZLIB) 
IFLAGS                += "-Ibuild/$(CONFIG)/inc"
LDFLAGS               += '-Wl,-rpath,@executable_path/' '-Wl,-rpath,@loader_path/'
LIBPATHS              += -Lbuild/$(CONFIG)/bin
LIBS                  += -ldl -lpthread -lm

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
    TARGETS           += build/$(CONFIG)/bin/libest.dylib
endif
TARGETS               += build/$(CONFIG)/bin/libmprssl.dylib

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
	@[ ! -f $(BUILD)/inc/me.h ] && cp projects/exp-macosx-default-me.h $(BUILD)/inc/me.h ; true
	@if ! diff $(BUILD)/inc/me.h projects/exp-macosx-default-me.h >/dev/null ; then\
		cp projects/exp-macosx-default-me.h $(BUILD)/inc/me.h  ; \
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
	rm -f "build/$(CONFIG)/bin/libejs.dylib"
	rm -f "build/$(CONFIG)/bin/libest.dylib"
	rm -f "build/$(CONFIG)/bin/libhttp.dylib"
	rm -f "build/$(CONFIG)/bin/libmpr.dylib"
	rm -f "build/$(CONFIG)/bin/libmprssl.dylib"
	rm -f "build/$(CONFIG)/bin/libpcre.dylib"
	rm -f "build/$(CONFIG)/bin/libzlib.dylib"

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
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/mprLib.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/paks/mpr/mprLib.c

#
#   libmpr
#
DEPS_5 += build/$(CONFIG)/inc/mpr.h
DEPS_5 += build/$(CONFIG)/inc/me.h
DEPS_5 += build/$(CONFIG)/inc/osdep.h
DEPS_5 += build/$(CONFIG)/obj/mprLib.o

build/$(CONFIG)/bin/libmpr.dylib: $(DEPS_5)
	null
#
#   libmpr
#
DEPS_6 += build/$(CONFIG)/inc/mpr.h
DEPS_6 += build/$(CONFIG)/inc/me.h
DEPS_6 += build/$(CONFIG)/inc/osdep.h
DEPS_6 += build/$(CONFIG)/obj/mprLib.o

build/$(CONFIG)/bin/libmpr.dylib: $(DEPS_6)
	@echo '      [Link] build/$(CONFIG)/bin/libmpr.dylib'
	$(CC) -dynamiclib -o build/$(CONFIG)/bin/libmpr.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) -install_name @rpath/libmpr.dylib -compatibility_version 0.4 -current_version 0.4 "build/$(CONFIG)/obj/mprLib.o" $(LIBS) 

#
#   pcre.h
#
build/$(CONFIG)/inc/pcre.h: $(DEPS_7)
	@echo '      [Copy] build/$(CONFIG)/inc/pcre.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/pcre/pcre.h build/$(CONFIG)/inc/pcre.h

#
#   pcre.o
#
DEPS_8 += build/$(CONFIG)/inc/me.h
DEPS_8 += build/$(CONFIG)/inc/pcre.h

build/$(CONFIG)/obj/pcre.o: \
    src/paks/pcre/pcre.c $(DEPS_8)
	@echo '   [Compile] build/$(CONFIG)/obj/pcre.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/pcre.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/paks/pcre/pcre.c

ifeq ($(ME_COM_PCRE),1)
#
#   libpcre
#
DEPS_9 += build/$(CONFIG)/inc/pcre.h
DEPS_9 += build/$(CONFIG)/inc/me.h
DEPS_9 += build/$(CONFIG)/obj/pcre.o

build/$(CONFIG)/bin/libpcre.dylib: $(DEPS_9)
	null
#
#   libpcre
#
DEPS_10 += build/$(CONFIG)/inc/pcre.h
DEPS_10 += build/$(CONFIG)/inc/me.h
DEPS_10 += build/$(CONFIG)/obj/pcre.o

build/$(CONFIG)/bin/libpcre.dylib: $(DEPS_10)
	@echo '      [Link] build/$(CONFIG)/bin/libpcre.dylib'
	$(CC) -dynamiclib -o build/$(CONFIG)/bin/libpcre.dylib -arch $(CC_ARCH) $(LDFLAGS) -compatibility_version 0.4 -current_version 0.4 $(LIBPATHS) -install_name @rpath/libpcre.dylib -compatibility_version 0.4 -current_version 0.4 "build/$(CONFIG)/obj/pcre.o" $(LIBS) 
endif

#
#   http.h
#
build/$(CONFIG)/inc/http.h: $(DEPS_11)
	@echo '      [Copy] build/$(CONFIG)/inc/http.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/http/http.h build/$(CONFIG)/inc/http.h

#
#   httpLib.o
#
DEPS_12 += build/$(CONFIG)/inc/me.h
DEPS_12 += build/$(CONFIG)/inc/http.h
DEPS_12 += build/$(CONFIG)/inc/mpr.h

build/$(CONFIG)/obj/httpLib.o: \
    src/paks/http/httpLib.c $(DEPS_12)
	@echo '   [Compile] build/$(CONFIG)/obj/httpLib.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/httpLib.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/paks/http/httpLib.c

ifeq ($(ME_COM_HTTP),1)
#
#   libhttp
#
DEPS_13 += build/$(CONFIG)/inc/mpr.h
DEPS_13 += build/$(CONFIG)/inc/me.h
DEPS_13 += build/$(CONFIG)/inc/osdep.h
DEPS_13 += build/$(CONFIG)/obj/mprLib.o
DEPS_13 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_13 += build/$(CONFIG)/inc/pcre.h
DEPS_13 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_13 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_13 += build/$(CONFIG)/inc/http.h
DEPS_13 += build/$(CONFIG)/obj/httpLib.o

build/$(CONFIG)/bin/libhttp.dylib: $(DEPS_13)
	null
#
#   libhttp
#
DEPS_14 += build/$(CONFIG)/inc/mpr.h
DEPS_14 += build/$(CONFIG)/inc/me.h
DEPS_14 += build/$(CONFIG)/inc/osdep.h
DEPS_14 += build/$(CONFIG)/obj/mprLib.o
DEPS_14 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_14 += build/$(CONFIG)/inc/pcre.h
DEPS_14 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_14 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_14 += build/$(CONFIG)/inc/http.h
DEPS_14 += build/$(CONFIG)/obj/httpLib.o

LIBS_14 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_14 += -lpcre
endif

build/$(CONFIG)/bin/libhttp.dylib: $(DEPS_14)
	@echo '      [Link] build/$(CONFIG)/bin/libhttp.dylib'
	$(CC) -dynamiclib -o build/$(CONFIG)/bin/libhttp.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) -install_name @rpath/libhttp.dylib -compatibility_version 0.4 -current_version 0.4 "build/$(CONFIG)/obj/httpLib.o" $(LIBPATHS_14) $(LIBS_14) $(LIBS_14) $(LIBS) 
endif

#
#   zlib.h
#
build/$(CONFIG)/inc/zlib.h: $(DEPS_15)
	@echo '      [Copy] build/$(CONFIG)/inc/zlib.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/zlib/zlib.h build/$(CONFIG)/inc/zlib.h

#
#   zlib.o
#
DEPS_16 += build/$(CONFIG)/inc/me.h
DEPS_16 += build/$(CONFIG)/inc/zlib.h

build/$(CONFIG)/obj/zlib.o: \
    src/paks/zlib/zlib.c $(DEPS_16)
	@echo '   [Compile] build/$(CONFIG)/obj/zlib.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/zlib.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/paks/zlib/zlib.c

ifeq ($(ME_COM_ZLIB),1)
#
#   libzlib
#
DEPS_17 += build/$(CONFIG)/inc/zlib.h
DEPS_17 += build/$(CONFIG)/inc/me.h
DEPS_17 += build/$(CONFIG)/obj/zlib.o

build/$(CONFIG)/bin/libzlib.dylib: $(DEPS_17)
	null
#
#   libzlib
#
DEPS_18 += build/$(CONFIG)/inc/zlib.h
DEPS_18 += build/$(CONFIG)/inc/me.h
DEPS_18 += build/$(CONFIG)/obj/zlib.o

build/$(CONFIG)/bin/libzlib.dylib: $(DEPS_18)
	@echo '      [Link] build/$(CONFIG)/bin/libzlib.dylib'
	$(CC) -dynamiclib -o build/$(CONFIG)/bin/libzlib.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) -install_name @rpath/libzlib.dylib -compatibility_version 0.4 -current_version 0.4 "build/$(CONFIG)/obj/zlib.o" $(LIBS) 
endif

#
#   ejs.h
#
build/$(CONFIG)/inc/ejs.h: $(DEPS_19)
	@echo '      [Copy] build/$(CONFIG)/inc/ejs.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/ejs/ejs.h build/$(CONFIG)/inc/ejs.h

#
#   ejs.slots.h
#
build/$(CONFIG)/inc/ejs.slots.h: $(DEPS_20)
	@echo '      [Copy] build/$(CONFIG)/inc/ejs.slots.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/ejs/ejs.slots.h build/$(CONFIG)/inc/ejs.slots.h

#
#   ejsByteGoto.h
#
build/$(CONFIG)/inc/ejsByteGoto.h: $(DEPS_21)
	@echo '      [Copy] build/$(CONFIG)/inc/ejsByteGoto.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/ejs/ejsByteGoto.h build/$(CONFIG)/inc/ejsByteGoto.h

#
#   ejsLib.o
#
DEPS_22 += build/$(CONFIG)/inc/me.h
DEPS_22 += build/$(CONFIG)/inc/ejs.h
DEPS_22 += build/$(CONFIG)/inc/mpr.h
DEPS_22 += build/$(CONFIG)/inc/pcre.h
DEPS_22 += build/$(CONFIG)/inc/osdep.h
DEPS_22 += build/$(CONFIG)/inc/http.h
DEPS_22 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_22 += build/$(CONFIG)/inc/zlib.h

build/$(CONFIG)/obj/ejsLib.o: \
    src/paks/ejs/ejsLib.c $(DEPS_22)
	@echo '   [Compile] build/$(CONFIG)/obj/ejsLib.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/ejsLib.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/paks/ejs/ejsLib.c

ifeq ($(ME_COM_EJS),1)
#
#   libejs
#
DEPS_23 += build/$(CONFIG)/inc/mpr.h
DEPS_23 += build/$(CONFIG)/inc/me.h
DEPS_23 += build/$(CONFIG)/inc/osdep.h
DEPS_23 += build/$(CONFIG)/obj/mprLib.o
DEPS_23 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_23 += build/$(CONFIG)/inc/pcre.h
DEPS_23 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_23 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_23 += build/$(CONFIG)/inc/http.h
DEPS_23 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_23 += build/$(CONFIG)/bin/libhttp.dylib
endif
DEPS_23 += build/$(CONFIG)/inc/zlib.h
DEPS_23 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_23 += build/$(CONFIG)/bin/libzlib.dylib
endif
DEPS_23 += build/$(CONFIG)/inc/ejs.h
DEPS_23 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_23 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_23 += build/$(CONFIG)/obj/ejsLib.o

build/$(CONFIG)/bin/libejs.dylib: $(DEPS_23)
	null
#
#   libejs
#
DEPS_24 += build/$(CONFIG)/inc/mpr.h
DEPS_24 += build/$(CONFIG)/inc/me.h
DEPS_24 += build/$(CONFIG)/inc/osdep.h
DEPS_24 += build/$(CONFIG)/obj/mprLib.o
DEPS_24 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_24 += build/$(CONFIG)/inc/pcre.h
DEPS_24 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_24 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_24 += build/$(CONFIG)/inc/http.h
DEPS_24 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_24 += build/$(CONFIG)/bin/libhttp.dylib
endif
DEPS_24 += build/$(CONFIG)/inc/zlib.h
DEPS_24 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_24 += build/$(CONFIG)/bin/libzlib.dylib
endif
DEPS_24 += build/$(CONFIG)/inc/ejs.h
DEPS_24 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_24 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_24 += build/$(CONFIG)/obj/ejsLib.o

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

build/$(CONFIG)/bin/libejs.dylib: $(DEPS_24)
	@echo '      [Link] build/$(CONFIG)/bin/libejs.dylib'
	$(CC) -dynamiclib -o build/$(CONFIG)/bin/libejs.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) -install_name @rpath/libejs.dylib -compatibility_version 0.4 -current_version 0.4 "build/$(CONFIG)/obj/ejsLib.o" $(LIBPATHS_24) $(LIBS_24) $(LIBS_24) $(LIBS) 
endif

#
#   ejsc.o
#
DEPS_25 += build/$(CONFIG)/inc/me.h
DEPS_25 += build/$(CONFIG)/inc/ejs.h

build/$(CONFIG)/obj/ejsc.o: \
    src/paks/ejs/ejsc.c $(DEPS_25)
	@echo '   [Compile] build/$(CONFIG)/obj/ejsc.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/ejsc.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/paks/ejs/ejsc.c

ifeq ($(ME_COM_EJS),1)
#
#   ejsc
#
DEPS_26 += build/$(CONFIG)/inc/mpr.h
DEPS_26 += build/$(CONFIG)/inc/me.h
DEPS_26 += build/$(CONFIG)/inc/osdep.h
DEPS_26 += build/$(CONFIG)/obj/mprLib.o
DEPS_26 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_26 += build/$(CONFIG)/inc/pcre.h
DEPS_26 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_26 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_26 += build/$(CONFIG)/inc/http.h
DEPS_26 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_26 += build/$(CONFIG)/bin/libhttp.dylib
endif
DEPS_26 += build/$(CONFIG)/inc/zlib.h
DEPS_26 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_26 += build/$(CONFIG)/bin/libzlib.dylib
endif
DEPS_26 += build/$(CONFIG)/inc/ejs.h
DEPS_26 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_26 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_26 += build/$(CONFIG)/obj/ejsLib.o
DEPS_26 += build/$(CONFIG)/bin/libejs.dylib
DEPS_26 += build/$(CONFIG)/obj/ejsc.o

build/$(CONFIG)/bin/ejsc: $(DEPS_26)
	null
#
#   ejsc
#
DEPS_27 += build/$(CONFIG)/inc/mpr.h
DEPS_27 += build/$(CONFIG)/inc/me.h
DEPS_27 += build/$(CONFIG)/inc/osdep.h
DEPS_27 += build/$(CONFIG)/obj/mprLib.o
DEPS_27 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_27 += build/$(CONFIG)/inc/pcre.h
DEPS_27 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_27 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_27 += build/$(CONFIG)/inc/http.h
DEPS_27 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_27 += build/$(CONFIG)/bin/libhttp.dylib
endif
DEPS_27 += build/$(CONFIG)/inc/zlib.h
DEPS_27 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_27 += build/$(CONFIG)/bin/libzlib.dylib
endif
DEPS_27 += build/$(CONFIG)/inc/ejs.h
DEPS_27 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_27 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_27 += build/$(CONFIG)/obj/ejsLib.o
DEPS_27 += build/$(CONFIG)/bin/libejs.dylib
DEPS_27 += build/$(CONFIG)/obj/ejsc.o

LIBS_27 += -lejs
ifeq ($(ME_COM_HTTP),1)
    LIBS_27 += -lhttp
endif
LIBS_27 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_27 += -lpcre
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_27 += -lzlib
endif

build/$(CONFIG)/bin/ejsc: $(DEPS_27)
	@echo '      [Link] build/$(CONFIG)/bin/ejsc'
	$(CC) -o build/$(CONFIG)/bin/ejsc -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/ejsc.o" $(LIBPATHS_27) $(LIBS_27) $(LIBS_27) $(LIBS) 
endif

ifeq ($(ME_COM_EJS),1)
#
#   ejs.mod
#
DEPS_28 += src/paks/ejs/ejs.es
DEPS_28 += build/$(CONFIG)/inc/mpr.h
DEPS_28 += build/$(CONFIG)/inc/me.h
DEPS_28 += build/$(CONFIG)/inc/osdep.h
DEPS_28 += build/$(CONFIG)/obj/mprLib.o
DEPS_28 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_28 += build/$(CONFIG)/inc/pcre.h
DEPS_28 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_28 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_28 += build/$(CONFIG)/inc/http.h
DEPS_28 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_28 += build/$(CONFIG)/bin/libhttp.dylib
endif
DEPS_28 += build/$(CONFIG)/inc/zlib.h
DEPS_28 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_28 += build/$(CONFIG)/bin/libzlib.dylib
endif
DEPS_28 += build/$(CONFIG)/inc/ejs.h
DEPS_28 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_28 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_28 += build/$(CONFIG)/obj/ejsLib.o
DEPS_28 += build/$(CONFIG)/bin/libejs.dylib
DEPS_28 += build/$(CONFIG)/obj/ejsc.o
DEPS_28 += build/$(CONFIG)/bin/ejsc

build/$(CONFIG)/bin/ejs.mod: $(DEPS_28)
	( \
	cd src/paks/ejs; \
	../../../build/$(CONFIG)/bin/ejsc --out ../../../build/$(CONFIG)/bin/ejs.mod --optimize 9 --bind --require null ejs.es ; \
	)
endif

#
#   ejs.o
#
DEPS_29 += build/$(CONFIG)/inc/me.h
DEPS_29 += build/$(CONFIG)/inc/ejs.h

build/$(CONFIG)/obj/ejs.o: \
    src/paks/ejs/ejs.c $(DEPS_29)
	@echo '   [Compile] build/$(CONFIG)/obj/ejs.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/ejs.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/paks/ejs/ejs.c

ifeq ($(ME_COM_EJS),1)
#
#   ejscmd
#
DEPS_30 += build/$(CONFIG)/inc/mpr.h
DEPS_30 += build/$(CONFIG)/inc/me.h
DEPS_30 += build/$(CONFIG)/inc/osdep.h
DEPS_30 += build/$(CONFIG)/obj/mprLib.o
DEPS_30 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_30 += build/$(CONFIG)/inc/pcre.h
DEPS_30 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_30 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_30 += build/$(CONFIG)/inc/http.h
DEPS_30 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_30 += build/$(CONFIG)/bin/libhttp.dylib
endif
DEPS_30 += build/$(CONFIG)/inc/zlib.h
DEPS_30 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_30 += build/$(CONFIG)/bin/libzlib.dylib
endif
DEPS_30 += build/$(CONFIG)/inc/ejs.h
DEPS_30 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_30 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_30 += build/$(CONFIG)/obj/ejsLib.o
DEPS_30 += build/$(CONFIG)/bin/libejs.dylib
DEPS_30 += build/$(CONFIG)/obj/ejs.o

build/$(CONFIG)/bin/ejs: $(DEPS_30)
	null
#
#   ejscmd
#
DEPS_31 += build/$(CONFIG)/inc/mpr.h
DEPS_31 += build/$(CONFIG)/inc/me.h
DEPS_31 += build/$(CONFIG)/inc/osdep.h
DEPS_31 += build/$(CONFIG)/obj/mprLib.o
DEPS_31 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_31 += build/$(CONFIG)/inc/pcre.h
DEPS_31 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_31 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_31 += build/$(CONFIG)/inc/http.h
DEPS_31 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_31 += build/$(CONFIG)/bin/libhttp.dylib
endif
DEPS_31 += build/$(CONFIG)/inc/zlib.h
DEPS_31 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_31 += build/$(CONFIG)/bin/libzlib.dylib
endif
DEPS_31 += build/$(CONFIG)/inc/ejs.h
DEPS_31 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_31 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_31 += build/$(CONFIG)/obj/ejsLib.o
DEPS_31 += build/$(CONFIG)/bin/libejs.dylib
DEPS_31 += build/$(CONFIG)/obj/ejs.o

LIBS_31 += -lejs
ifeq ($(ME_COM_HTTP),1)
    LIBS_31 += -lhttp
endif
LIBS_31 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_31 += -lpcre
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_31 += -lzlib
endif

build/$(CONFIG)/bin/ejs: $(DEPS_31)
	@echo '      [Link] build/$(CONFIG)/bin/ejs'
	$(CC) -o build/$(CONFIG)/bin/ejs -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/ejs.o" $(LIBPATHS_31) $(LIBS_31) $(LIBS_31) $(LIBS) -ledit 
endif

#
#   exp.mod
#
DEPS_32 += src/exp.es
DEPS_32 += src/ExpTemplate.es
DEPS_32 += src/paks/ejs-version/Version.es
DEPS_32 += build/$(CONFIG)/inc/mpr.h
DEPS_32 += build/$(CONFIG)/inc/me.h
DEPS_32 += build/$(CONFIG)/inc/osdep.h
DEPS_32 += build/$(CONFIG)/obj/mprLib.o
DEPS_32 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_32 += build/$(CONFIG)/inc/pcre.h
DEPS_32 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_32 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_32 += build/$(CONFIG)/inc/http.h
DEPS_32 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_32 += build/$(CONFIG)/bin/libhttp.dylib
endif
DEPS_32 += build/$(CONFIG)/inc/zlib.h
DEPS_32 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_32 += build/$(CONFIG)/bin/libzlib.dylib
endif
DEPS_32 += build/$(CONFIG)/inc/ejs.h
DEPS_32 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_32 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_32 += build/$(CONFIG)/obj/ejsLib.o
ifeq ($(ME_COM_EJS),1)
    DEPS_32 += build/$(CONFIG)/bin/libejs.dylib
endif
DEPS_32 += build/$(CONFIG)/obj/ejsc.o
ifeq ($(ME_COM_EJS),1)
    DEPS_32 += build/$(CONFIG)/bin/ejsc
endif

build/$(CONFIG)/bin/exp.mod: $(DEPS_32)
	( \
	cd .; \
	./build/$(CONFIG)/bin/ejsc --debug --out ./build/$(CONFIG)/bin/exp.mod --optimize 9 src/exp.es src/ExpTemplate.es src/paks/ejs-version/Version.es ; \
	)

#
#   exp.h
#
build/$(CONFIG)/inc/exp.h: $(DEPS_33)
	@echo '      [Copy] build/$(CONFIG)/inc/exp.h'

#
#   exp.o
#
DEPS_34 += build/$(CONFIG)/inc/me.h
DEPS_34 += build/$(CONFIG)/inc/ejs.h
DEPS_34 += build/$(CONFIG)/inc/exp.h

build/$(CONFIG)/obj/exp.o: \
    src/exp.c $(DEPS_34)
	@echo '   [Compile] build/$(CONFIG)/obj/exp.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/exp.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/exp.c

#
#   expTemplate.o
#
DEPS_35 += build/$(CONFIG)/inc/me.h
DEPS_35 += build/$(CONFIG)/inc/ejs.h
DEPS_35 += build/$(CONFIG)/inc/exp.h

build/$(CONFIG)/obj/expTemplate.o: \
    src/expTemplate.c $(DEPS_35)
	@echo '   [Compile] build/$(CONFIG)/obj/expTemplate.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/expTemplate.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/expTemplate.c

#
#   exp
#
DEPS_36 += build/$(CONFIG)/inc/mpr.h
DEPS_36 += build/$(CONFIG)/inc/me.h
DEPS_36 += build/$(CONFIG)/inc/osdep.h
DEPS_36 += build/$(CONFIG)/obj/mprLib.o
DEPS_36 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_36 += build/$(CONFIG)/inc/pcre.h
DEPS_36 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_36 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_36 += build/$(CONFIG)/inc/http.h
DEPS_36 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_36 += build/$(CONFIG)/bin/libhttp.dylib
endif
DEPS_36 += build/$(CONFIG)/inc/zlib.h
DEPS_36 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_36 += build/$(CONFIG)/bin/libzlib.dylib
endif
DEPS_36 += build/$(CONFIG)/inc/ejs.h
DEPS_36 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_36 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_36 += build/$(CONFIG)/obj/ejsLib.o
ifeq ($(ME_COM_EJS),1)
    DEPS_36 += build/$(CONFIG)/bin/libejs.dylib
endif
DEPS_36 += build/$(CONFIG)/obj/ejsc.o
ifeq ($(ME_COM_EJS),1)
    DEPS_36 += build/$(CONFIG)/bin/ejsc
endif
DEPS_36 += build/$(CONFIG)/bin/exp.mod
DEPS_36 += build/$(CONFIG)/inc/exp.h
DEPS_36 += build/$(CONFIG)/obj/exp.o
DEPS_36 += build/$(CONFIG)/obj/expTemplate.o

build/$(CONFIG)/bin/exp: $(DEPS_36)
	null
#
#   exp
#
DEPS_37 += build/$(CONFIG)/inc/mpr.h
DEPS_37 += build/$(CONFIG)/inc/me.h
DEPS_37 += build/$(CONFIG)/inc/osdep.h
DEPS_37 += build/$(CONFIG)/obj/mprLib.o
DEPS_37 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_37 += build/$(CONFIG)/inc/pcre.h
DEPS_37 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_37 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_37 += build/$(CONFIG)/inc/http.h
DEPS_37 += build/$(CONFIG)/obj/httpLib.o
ifeq ($(ME_COM_HTTP),1)
    DEPS_37 += build/$(CONFIG)/bin/libhttp.dylib
endif
DEPS_37 += build/$(CONFIG)/inc/zlib.h
DEPS_37 += build/$(CONFIG)/obj/zlib.o
ifeq ($(ME_COM_ZLIB),1)
    DEPS_37 += build/$(CONFIG)/bin/libzlib.dylib
endif
DEPS_37 += build/$(CONFIG)/inc/ejs.h
DEPS_37 += build/$(CONFIG)/inc/ejs.slots.h
DEPS_37 += build/$(CONFIG)/inc/ejsByteGoto.h
DEPS_37 += build/$(CONFIG)/obj/ejsLib.o
ifeq ($(ME_COM_EJS),1)
    DEPS_37 += build/$(CONFIG)/bin/libejs.dylib
endif
DEPS_37 += build/$(CONFIG)/obj/ejsc.o
ifeq ($(ME_COM_EJS),1)
    DEPS_37 += build/$(CONFIG)/bin/ejsc
endif
DEPS_37 += build/$(CONFIG)/bin/exp.mod
DEPS_37 += build/$(CONFIG)/inc/exp.h
DEPS_37 += build/$(CONFIG)/obj/exp.o
DEPS_37 += build/$(CONFIG)/obj/expTemplate.o

LIBS_37 += -lmpr
ifeq ($(ME_COM_HTTP),1)
    LIBS_37 += -lhttp
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_37 += -lpcre
endif
ifeq ($(ME_COM_EJS),1)
    LIBS_37 += -lejs
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_37 += -lzlib
endif

build/$(CONFIG)/bin/exp: $(DEPS_37)
	@echo '      [Link] build/$(CONFIG)/bin/exp'
	$(CC) -o build/$(CONFIG)/bin/exp -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/exp.o" "build/$(CONFIG)/obj/expTemplate.o" $(LIBPATHS_37) $(LIBS_37) $(LIBS_37) $(LIBS) 

#
#   exp.sample
#
DEPS_38 += src/exp.sample

build/$(CONFIG)/bin/exp.sample: $(DEPS_38)
	( \
	cd .; \
	cp src/exp.sample build/$(CONFIG)/bin/exp.sample ; \
	)


#
#   http-ca-crt
#
DEPS_39 += src/paks/http/ca.crt

build/$(CONFIG)/bin/ca.crt: $(DEPS_39)
	null
#
#   http-ca-crt
#
DEPS_40 += src/paks/http/ca.crt

build/$(CONFIG)/bin/ca.crt: $(DEPS_40)
	@echo '      [Copy] build/$(CONFIG)/bin/ca.crt'
	mkdir -p "build/$(CONFIG)/bin"
	cp src/paks/http/ca.crt build/$(CONFIG)/bin/ca.crt

#
#   http.o
#
DEPS_41 += build/$(CONFIG)/inc/me.h
DEPS_41 += build/$(CONFIG)/inc/http.h

build/$(CONFIG)/obj/http.o: \
    src/paks/http/http.c $(DEPS_41)
	@echo '   [Compile] build/$(CONFIG)/obj/http.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/http.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/paks/http/http.c

ifeq ($(ME_COM_HTTP),1)
#
#   httpcmd
#
DEPS_42 += build/$(CONFIG)/inc/mpr.h
DEPS_42 += build/$(CONFIG)/inc/me.h
DEPS_42 += build/$(CONFIG)/inc/osdep.h
DEPS_42 += build/$(CONFIG)/obj/mprLib.o
DEPS_42 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_42 += build/$(CONFIG)/inc/pcre.h
DEPS_42 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_42 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_42 += build/$(CONFIG)/inc/http.h
DEPS_42 += build/$(CONFIG)/obj/httpLib.o
DEPS_42 += build/$(CONFIG)/bin/libhttp.dylib
DEPS_42 += build/$(CONFIG)/obj/http.o

build/$(CONFIG)/bin/http: $(DEPS_42)
	null
#
#   httpcmd
#
DEPS_43 += build/$(CONFIG)/inc/mpr.h
DEPS_43 += build/$(CONFIG)/inc/me.h
DEPS_43 += build/$(CONFIG)/inc/osdep.h
DEPS_43 += build/$(CONFIG)/obj/mprLib.o
DEPS_43 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_43 += build/$(CONFIG)/inc/pcre.h
DEPS_43 += build/$(CONFIG)/obj/pcre.o
ifeq ($(ME_COM_PCRE),1)
    DEPS_43 += build/$(CONFIG)/bin/libpcre.dylib
endif
DEPS_43 += build/$(CONFIG)/inc/http.h
DEPS_43 += build/$(CONFIG)/obj/httpLib.o
DEPS_43 += build/$(CONFIG)/bin/libhttp.dylib
DEPS_43 += build/$(CONFIG)/obj/http.o

LIBS_43 += -lhttp
LIBS_43 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_43 += -lpcre
endif

build/$(CONFIG)/bin/http: $(DEPS_43)
	@echo '      [Link] build/$(CONFIG)/bin/http'
	$(CC) -o build/$(CONFIG)/bin/http -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) "build/$(CONFIG)/obj/http.o" $(LIBPATHS_43) $(LIBS_43) $(LIBS_43) $(LIBS) 
endif

#
#   est.h
#
build/$(CONFIG)/inc/est.h: $(DEPS_44)
	@echo '      [Copy] build/$(CONFIG)/inc/est.h'
	mkdir -p "build/$(CONFIG)/inc"
	cp src/paks/est/est.h build/$(CONFIG)/inc/est.h

#
#   estLib.o
#
DEPS_45 += build/$(CONFIG)/inc/me.h
DEPS_45 += build/$(CONFIG)/inc/est.h
DEPS_45 += build/$(CONFIG)/inc/osdep.h

build/$(CONFIG)/obj/estLib.o: \
    src/paks/est/estLib.c $(DEPS_45)
	@echo '   [Compile] build/$(CONFIG)/obj/estLib.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/estLib.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/paks/est/estLib.c

ifeq ($(ME_COM_EST),1)
#
#   libest
#
DEPS_46 += build/$(CONFIG)/inc/est.h
DEPS_46 += build/$(CONFIG)/inc/me.h
DEPS_46 += build/$(CONFIG)/inc/osdep.h
DEPS_46 += build/$(CONFIG)/obj/estLib.o

build/$(CONFIG)/bin/libest.dylib: $(DEPS_46)
	null
#
#   libest
#
DEPS_47 += build/$(CONFIG)/inc/est.h
DEPS_47 += build/$(CONFIG)/inc/me.h
DEPS_47 += build/$(CONFIG)/inc/osdep.h
DEPS_47 += build/$(CONFIG)/obj/estLib.o

build/$(CONFIG)/bin/libest.dylib: $(DEPS_47)
	@echo '      [Link] build/$(CONFIG)/bin/libest.dylib'
	$(CC) -dynamiclib -o build/$(CONFIG)/bin/libest.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) -install_name @rpath/libest.dylib -compatibility_version 0.4 -current_version 0.4 "build/$(CONFIG)/obj/estLib.o" $(LIBS) 
endif

#
#   mprSsl.o
#
DEPS_48 += build/$(CONFIG)/inc/me.h
DEPS_48 += build/$(CONFIG)/inc/mpr.h

build/$(CONFIG)/obj/mprSsl.o: \
    src/paks/mpr/mprSsl.c $(DEPS_48)
	@echo '   [Compile] build/$(CONFIG)/obj/mprSsl.o'
	$(CC) -c $(DFLAGS) -o build/$(CONFIG)/obj/mprSsl.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/paks/mpr/mprSsl.c

#
#   libmprssl
#
DEPS_49 += build/$(CONFIG)/inc/mpr.h
DEPS_49 += build/$(CONFIG)/inc/me.h
DEPS_49 += build/$(CONFIG)/inc/osdep.h
DEPS_49 += build/$(CONFIG)/obj/mprLib.o
DEPS_49 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_49 += build/$(CONFIG)/inc/est.h
DEPS_49 += build/$(CONFIG)/obj/estLib.o
ifeq ($(ME_COM_EST),1)
    DEPS_49 += build/$(CONFIG)/bin/libest.dylib
endif
DEPS_49 += build/$(CONFIG)/obj/mprSsl.o

build/$(CONFIG)/bin/libmprssl.dylib: $(DEPS_49)
	null
#
#   libmprssl
#
DEPS_50 += build/$(CONFIG)/inc/mpr.h
DEPS_50 += build/$(CONFIG)/inc/me.h
DEPS_50 += build/$(CONFIG)/inc/osdep.h
DEPS_50 += build/$(CONFIG)/obj/mprLib.o
DEPS_50 += build/$(CONFIG)/bin/libmpr.dylib
DEPS_50 += build/$(CONFIG)/inc/est.h
DEPS_50 += build/$(CONFIG)/obj/estLib.o
ifeq ($(ME_COM_EST),1)
    DEPS_50 += build/$(CONFIG)/bin/libest.dylib
endif
DEPS_50 += build/$(CONFIG)/obj/mprSsl.o

LIBS_50 += -lmpr
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_50 += -lssl
    LIBPATHS_50 += -L$(ME_COM_OPENSSL_PATH)
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_50 += -lcrypto
    LIBPATHS_50 += -L$(ME_COM_OPENSSL_PATH)
endif
ifeq ($(ME_COM_EST),1)
    LIBS_50 += -lest
endif

build/$(CONFIG)/bin/libmprssl.dylib: $(DEPS_50)
	@echo '      [Link] build/$(CONFIG)/bin/libmprssl.dylib'
	$(CC) -dynamiclib -o build/$(CONFIG)/bin/libmprssl.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)  -install_name @rpath/libmprssl.dylib -compatibility_version 0.4 -current_version 0.4 "build/$(CONFIG)/obj/mprSsl.o" $(LIBPATHS_50) $(LIBS_50) $(LIBS_50) $(LIBS) 

#
#   stop
#
stop: $(DEPS_51)
	null

#
#   installBinary
#
installBinary: $(DEPS_52)
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
	cp build/$(CONFIG)/bin/libejs.dylib $(ME_VAPP_PREFIX)/bin/libejs.dylib ; \
	cp build/$(CONFIG)/bin/libhttp.dylib $(ME_VAPP_PREFIX)/bin/libhttp.dylib ; \
	cp build/$(CONFIG)/bin/libmpr.dylib $(ME_VAPP_PREFIX)/bin/libmpr.dylib ; \
	cp build/$(CONFIG)/bin/libmprssl.dylib $(ME_VAPP_PREFIX)/bin/libmprssl.dylib ; \
	cp build/$(CONFIG)/bin/libpcre.dylib $(ME_VAPP_PREFIX)/bin/libpcre.dylib ; \
	cp build/$(CONFIG)/bin/libzlib.dylib $(ME_VAPP_PREFIX)/bin/libzlib.dylib ; \
	if [ "$(ME_COM_EST)" = 1 ]; then true ; \
	cp build/$(CONFIG)/bin/libest.dylib $(ME_VAPP_PREFIX)/bin/libest.dylib ; \
	fi ; \
	if [ "$(ME_COM_OPENSSL)" = 1 ]; then true ; \
	cp build/$(CONFIG)/bin/libssl*.dylib* $(ME_VAPP_PREFIX)/bin/libssl*.dylib* ; \
	cp build/$(CONFIG)/bin/libcrypto*.dylib* $(ME_VAPP_PREFIX)/bin/libcrypto*.dylib* ; \
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
start: $(DEPS_53)
	null

#
#   install
#
DEPS_54 += stop
DEPS_54 += installBinary
DEPS_54 += start

install: $(DEPS_54)

#
#   mob
#
mob: $(DEPS_55)
	( \
	cd .; \
	date ; \
	)

#
#   uninstall
#
DEPS_56 += stop

uninstall: $(DEPS_56)

#
#   version
#
version: $(DEPS_57)
	echo 0.4.0

