#
#   expansive-macosx-default.mk -- Makefile to build Embedthis Expansive for macosx
#

NAME                  := expansive
VERSION               := 0.5.1
PROFILE               ?= default
ARCH                  ?= $(shell uname -m | sed 's/i.86/x86/;s/x86_64/x64/;s/arm.*/arm/;s/mips.*/mips/')
CC_ARCH               ?= $(shell echo $(ARCH) | sed 's/x86/i686/;s/x64/x86_64/')
OS                    ?= macosx
CC                    ?= clang
CONFIG                ?= $(OS)-$(ARCH)-$(PROFILE)
BUILD                 ?= build/$(CONFIG)
LBIN                  ?= $(BUILD)/bin
PATH                  := $(LBIN):$(PATH)

ME_COM_COMPILER       ?= 1
ME_COM_EJS            ?= 1
ME_COM_EST            ?= 0
ME_COM_HTTP           ?= 1
ME_COM_LIB            ?= 1
ME_COM_MATRIXSSL      ?= 0
ME_COM_MPR            ?= 1
ME_COM_NANOSSL        ?= 0
ME_COM_OPENSSL        ?= 1
ME_COM_OSDEP          ?= 1
ME_COM_PCRE           ?= 1
ME_COM_SQLITE         ?= 0
ME_COM_SSL            ?= 1
ME_COM_VXWORKS        ?= 0
ME_COM_WINSDK         ?= 1
ME_COM_ZLIB           ?= 1

ME_COM_OPENSSL_PATH   ?= "/usr/lib"

ifeq ($(ME_COM_EST),1)
    ME_COM_SSL := 1
endif
ifeq ($(ME_COM_LIB),1)
    ME_COM_COMPILER := 1
endif
ifeq ($(ME_COM_OPENSSL),1)
    ME_COM_SSL := 1
endif
ifeq ($(ME_COM_EJS),1)
    ME_COM_ZLIB := 1
endif

CFLAGS                += -g -w
DFLAGS                +=  $(patsubst %,-D%,$(filter ME_%,$(MAKEFLAGS))) -DME_COM_COMPILER=$(ME_COM_COMPILER) -DME_COM_EJS=$(ME_COM_EJS) -DME_COM_EST=$(ME_COM_EST) -DME_COM_HTTP=$(ME_COM_HTTP) -DME_COM_LIB=$(ME_COM_LIB) -DME_COM_MATRIXSSL=$(ME_COM_MATRIXSSL) -DME_COM_MPR=$(ME_COM_MPR) -DME_COM_NANOSSL=$(ME_COM_NANOSSL) -DME_COM_OPENSSL=$(ME_COM_OPENSSL) -DME_COM_OSDEP=$(ME_COM_OSDEP) -DME_COM_PCRE=$(ME_COM_PCRE) -DME_COM_SQLITE=$(ME_COM_SQLITE) -DME_COM_SSL=$(ME_COM_SSL) -DME_COM_VXWORKS=$(ME_COM_VXWORKS) -DME_COM_WINSDK=$(ME_COM_WINSDK) -DME_COM_ZLIB=$(ME_COM_ZLIB) 
IFLAGS                += "-I$(BUILD)/inc"
LDFLAGS               += '-Wl,-rpath,@executable_path/' '-Wl,-rpath,@loader_path/'
LIBPATHS              += -L$(BUILD)/bin
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
ME_WEB_PREFIX         ?= $(ME_ROOT_PREFIX)/var/www/$(NAME)
ME_LOG_PREFIX         ?= $(ME_ROOT_PREFIX)/var/log/$(NAME)
ME_SPOOL_PREFIX       ?= $(ME_ROOT_PREFIX)/var/spool/$(NAME)
ME_CACHE_PREFIX       ?= $(ME_ROOT_PREFIX)/var/spool/$(NAME)/cache
ME_SRC_PREFIX         ?= $(ME_ROOT_PREFIX)$(NAME)-$(VERSION)


ifeq ($(ME_COM_EJS),1)
    TARGETS           += $(BUILD)/bin/ejs.mod
endif
ifeq ($(ME_COM_EJS),1)
    TARGETS           += $(BUILD)/bin/ejs
endif
TARGETS               += $(BUILD)/bin/expansive
ifeq ($(ME_COM_HTTP),1)
    TARGETS           += $(BUILD)/bin/http
endif
TARGETS               += $(BUILD)/bin/roots.crt
TARGETS               += $(BUILD)/bin/sample.json

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
	@[ ! -f $(BUILD)/inc/me.h ] && cp projects/expansive-macosx-default-me.h $(BUILD)/inc/me.h ; true
	@if ! diff $(BUILD)/inc/me.h projects/expansive-macosx-default-me.h >/dev/null ; then\
		cp projects/expansive-macosx-default-me.h $(BUILD)/inc/me.h  ; \
	fi; true
	@if [ -f "$(BUILD)/.makeflags" ] ; then \
		if [ "$(MAKEFLAGS)" != "`cat $(BUILD)/.makeflags`" ] ; then \
			echo "   [Warning] Make flags have changed since the last build: "`cat $(BUILD)/.makeflags`"" ; \
		fi ; \
	fi
	@echo "$(MAKEFLAGS)" >$(BUILD)/.makeflags

clean:
	rm -f "$(BUILD)/obj/ejs.o"
	rm -f "$(BUILD)/obj/ejsLib.o"
	rm -f "$(BUILD)/obj/ejsc.o"
	rm -f "$(BUILD)/obj/expParser.o"
	rm -f "$(BUILD)/obj/expansive.o"
	rm -f "$(BUILD)/obj/http.o"
	rm -f "$(BUILD)/obj/httpLib.o"
	rm -f "$(BUILD)/obj/mprLib.o"
	rm -f "$(BUILD)/obj/openssl.o"
	rm -f "$(BUILD)/obj/pcre.o"
	rm -f "$(BUILD)/obj/zlib.o"
	rm -f "$(BUILD)/bin/ejsc"
	rm -f "$(BUILD)/bin/ejs"
	rm -f "$(BUILD)/bin/expansive"
	rm -f "$(BUILD)/bin/http"
	rm -f "$(BUILD)/bin/libejs.dylib"
	rm -f "$(BUILD)/bin/libhttp.dylib"
	rm -f "$(BUILD)/bin/libmpr.dylib"
	rm -f "$(BUILD)/bin/libpcre.dylib"
	rm -f "$(BUILD)/bin/libzlib.dylib"
	rm -f "$(BUILD)/bin/libopenssl.a"
	rm -f "$(BUILD)/bin/roots.crt"
	rm -f "$(BUILD)/bin/sample.json"

clobber: clean
	rm -fr ./$(BUILD)

#
#   me.h
#

$(BUILD)/inc/me.h: $(DEPS_1)

#
#   osdep.h
#
DEPS_2 += src/osdep/osdep.h
DEPS_2 += $(BUILD)/inc/me.h

$(BUILD)/inc/osdep.h: $(DEPS_2)
	@echo '      [Copy] $(BUILD)/inc/osdep.h'
	mkdir -p "$(BUILD)/inc"
	cp src/osdep/osdep.h $(BUILD)/inc/osdep.h

#
#   mpr.h
#
DEPS_3 += src/mpr/mpr.h
DEPS_3 += $(BUILD)/inc/me.h
DEPS_3 += $(BUILD)/inc/osdep.h

$(BUILD)/inc/mpr.h: $(DEPS_3)
	@echo '      [Copy] $(BUILD)/inc/mpr.h'
	mkdir -p "$(BUILD)/inc"
	cp src/mpr/mpr.h $(BUILD)/inc/mpr.h

#
#   http.h
#
DEPS_4 += src/http/http.h
DEPS_4 += $(BUILD)/inc/mpr.h

$(BUILD)/inc/http.h: $(DEPS_4)
	@echo '      [Copy] $(BUILD)/inc/http.h'
	mkdir -p "$(BUILD)/inc"
	cp src/http/http.h $(BUILD)/inc/http.h

#
#   ejs.slots.h
#

src/ejs/ejs.slots.h: $(DEPS_5)

#
#   pcre.h
#
DEPS_6 += src/pcre/pcre.h

$(BUILD)/inc/pcre.h: $(DEPS_6)
	@echo '      [Copy] $(BUILD)/inc/pcre.h'
	mkdir -p "$(BUILD)/inc"
	cp src/pcre/pcre.h $(BUILD)/inc/pcre.h

#
#   zlib.h
#
DEPS_7 += src/zlib/zlib.h
DEPS_7 += $(BUILD)/inc/me.h

$(BUILD)/inc/zlib.h: $(DEPS_7)
	@echo '      [Copy] $(BUILD)/inc/zlib.h'
	mkdir -p "$(BUILD)/inc"
	cp src/zlib/zlib.h $(BUILD)/inc/zlib.h

#
#   ejs.h
#
DEPS_8 += src/ejs/ejs.h
DEPS_8 += $(BUILD)/inc/me.h
DEPS_8 += $(BUILD)/inc/osdep.h
DEPS_8 += $(BUILD)/inc/mpr.h
DEPS_8 += $(BUILD)/inc/http.h
DEPS_8 += src/ejs/ejs.slots.h
DEPS_8 += $(BUILD)/inc/pcre.h
DEPS_8 += $(BUILD)/inc/zlib.h

$(BUILD)/inc/ejs.h: $(DEPS_8)
	@echo '      [Copy] $(BUILD)/inc/ejs.h'
	mkdir -p "$(BUILD)/inc"
	cp src/ejs/ejs.h $(BUILD)/inc/ejs.h

#
#   ejs.slots.h
#
DEPS_9 += src/ejs/ejs.slots.h

$(BUILD)/inc/ejs.slots.h: $(DEPS_9)
	@echo '      [Copy] $(BUILD)/inc/ejs.slots.h'
	mkdir -p "$(BUILD)/inc"
	cp src/ejs/ejs.slots.h $(BUILD)/inc/ejs.slots.h

#
#   ejsByteGoto.h
#
DEPS_10 += src/ejs/ejsByteGoto.h

$(BUILD)/inc/ejsByteGoto.h: $(DEPS_10)
	@echo '      [Copy] $(BUILD)/inc/ejsByteGoto.h'
	mkdir -p "$(BUILD)/inc"
	cp src/ejs/ejsByteGoto.h $(BUILD)/inc/ejsByteGoto.h

#
#   expansive.h
#

$(BUILD)/inc/expansive.h: $(DEPS_11)

#
#   ejs.h
#

src/ejs/ejs.h: $(DEPS_12)

#
#   ejs.o
#
DEPS_13 += src/ejs/ejs.h

$(BUILD)/obj/ejs.o: \
    src/ejs/ejs.c $(DEPS_13)
	@echo '   [Compile] $(BUILD)/obj/ejs.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/ejs.o -arch $(CC_ARCH) $(CFLAGS) -DME_COM_OPENSSL_PATH="$(ME_COM_OPENSSL_PATH)" $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/ejs/ejs.c

#
#   ejsLib.o
#
DEPS_14 += src/ejs/ejs.h
DEPS_14 += $(BUILD)/inc/mpr.h
DEPS_14 += $(BUILD)/inc/pcre.h
DEPS_14 += $(BUILD)/inc/me.h

$(BUILD)/obj/ejsLib.o: \
    src/ejs/ejsLib.c $(DEPS_14)
	@echo '   [Compile] $(BUILD)/obj/ejsLib.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/ejsLib.o -arch $(CC_ARCH) $(CFLAGS) -DME_COM_OPENSSL_PATH="$(ME_COM_OPENSSL_PATH)" $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/ejs/ejsLib.c

#
#   ejsc.o
#
DEPS_15 += src/ejs/ejs.h

$(BUILD)/obj/ejsc.o: \
    src/ejs/ejsc.c $(DEPS_15)
	@echo '   [Compile] $(BUILD)/obj/ejsc.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/ejsc.o -arch $(CC_ARCH) $(CFLAGS) -DME_COM_OPENSSL_PATH="$(ME_COM_OPENSSL_PATH)" $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/ejs/ejsc.c

#
#   expParser.o
#
DEPS_16 += $(BUILD)/inc/ejs.h
DEPS_16 += $(BUILD)/inc/expansive.h

$(BUILD)/obj/expParser.o: \
    src/expParser.c $(DEPS_16)
	@echo '   [Compile] $(BUILD)/obj/expParser.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/expParser.o -arch $(CC_ARCH) $(CFLAGS) -DME_COM_OPENSSL_PATH="$(ME_COM_OPENSSL_PATH)" $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/expParser.c

#
#   expansive.o
#
DEPS_17 += $(BUILD)/inc/ejs.h
DEPS_17 += $(BUILD)/inc/expansive.h

$(BUILD)/obj/expansive.o: \
    src/expansive.c $(DEPS_17)
	@echo '   [Compile] $(BUILD)/obj/expansive.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/expansive.o -arch $(CC_ARCH) $(CFLAGS) -DME_COM_OPENSSL_PATH="$(ME_COM_OPENSSL_PATH)" $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/expansive.c

#
#   http.h
#

src/http/http.h: $(DEPS_18)

#
#   http.o
#
DEPS_19 += src/http/http.h

$(BUILD)/obj/http.o: \
    src/http/http.c $(DEPS_19)
	@echo '   [Compile] $(BUILD)/obj/http.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/http.o -arch $(CC_ARCH) $(CFLAGS) -DME_COM_OPENSSL_PATH="$(ME_COM_OPENSSL_PATH)" $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/http/http.c

#
#   httpLib.o
#
DEPS_20 += src/http/http.h
DEPS_20 += $(BUILD)/inc/pcre.h

$(BUILD)/obj/httpLib.o: \
    src/http/httpLib.c $(DEPS_20)
	@echo '   [Compile] $(BUILD)/obj/httpLib.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/httpLib.o -arch $(CC_ARCH) $(CFLAGS) -DME_COM_OPENSSL_PATH="$(ME_COM_OPENSSL_PATH)" $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/http/httpLib.c

#
#   mpr.h
#

src/mpr/mpr.h: $(DEPS_21)

#
#   mprLib.o
#
DEPS_22 += src/mpr/mpr.h

$(BUILD)/obj/mprLib.o: \
    src/mpr/mprLib.c $(DEPS_22)
	@echo '   [Compile] $(BUILD)/obj/mprLib.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/mprLib.o -arch $(CC_ARCH) $(CFLAGS) -DME_COM_OPENSSL_PATH="$(ME_COM_OPENSSL_PATH)" $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/mpr/mprLib.c

#
#   openssl.o
#
DEPS_23 += $(BUILD)/inc/mpr.h

$(BUILD)/obj/openssl.o: \
    src/mpr-openssl/openssl.c $(DEPS_23)
	@echo '   [Compile] $(BUILD)/obj/openssl.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/openssl.o -arch $(CC_ARCH) -Wno-deprecated-declarations -DME_COM_OPENSSL_PATH="$(ME_COM_OPENSSL_PATH)" $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/mpr-openssl/openssl.c

#
#   pcre.h
#

src/pcre/pcre.h: $(DEPS_24)

#
#   pcre.o
#
DEPS_25 += $(BUILD)/inc/me.h
DEPS_25 += src/pcre/pcre.h

$(BUILD)/obj/pcre.o: \
    src/pcre/pcre.c $(DEPS_25)
	@echo '   [Compile] $(BUILD)/obj/pcre.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/pcre.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/pcre/pcre.c

#
#   zlib.h
#

src/zlib/zlib.h: $(DEPS_26)

#
#   zlib.o
#
DEPS_27 += $(BUILD)/inc/me.h
DEPS_27 += src/zlib/zlib.h

$(BUILD)/obj/zlib.o: \
    src/zlib/zlib.c $(DEPS_27)
	@echo '   [Compile] $(BUILD)/obj/zlib.o'
	$(CC) -c $(DFLAGS) -o $(BUILD)/obj/zlib.o -arch $(CC_ARCH) $(CFLAGS) $(IFLAGS) src/zlib/zlib.c

ifeq ($(ME_COM_SSL),1)
#
#   openssl
#
DEPS_28 += $(BUILD)/obj/openssl.o

$(BUILD)/bin/libopenssl.a: $(DEPS_28)
	@echo '      [Link] $(BUILD)/bin/libopenssl.a'
	ar -cr $(BUILD)/bin/libopenssl.a "$(BUILD)/obj/openssl.o"
endif

#
#   libmpr
#
DEPS_29 += $(BUILD)/inc/osdep.h
ifeq ($(ME_COM_SSL),1)
    DEPS_29 += $(BUILD)/bin/libopenssl.a
endif
DEPS_29 += $(BUILD)/inc/mpr.h
DEPS_29 += $(BUILD)/obj/mprLib.o

ifeq ($(ME_COM_EST),1)
    LIBS_29 += -lestssl
endif
ifeq ($(ME_COM_EST),1)
    LIBS_29 += -lest
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_29 += -lopenssl
    LIBPATHS_29 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_29 += -lssl
    LIBPATHS_29 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_29 += -lcrypto
    LIBPATHS_29 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/libmpr.dylib: $(DEPS_29)
	@echo '      [Link] $(BUILD)/bin/libmpr.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libmpr.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)  -install_name @rpath/libmpr.dylib -compatibility_version 0.5 -current_version 0.5 "$(BUILD)/obj/mprLib.o" $(LIBPATHS_29) $(LIBS_29) $(LIBS_29) $(LIBS) 

ifeq ($(ME_COM_PCRE),1)
#
#   libpcre
#
DEPS_30 += $(BUILD)/inc/pcre.h
DEPS_30 += $(BUILD)/obj/pcre.o

$(BUILD)/bin/libpcre.dylib: $(DEPS_30)
	@echo '      [Link] $(BUILD)/bin/libpcre.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libpcre.dylib -arch $(CC_ARCH) $(LDFLAGS) -compatibility_version 0.5 -current_version 0.5 $(LIBPATHS) -install_name @rpath/libpcre.dylib -compatibility_version 0.5 -current_version 0.5 "$(BUILD)/obj/pcre.o" $(LIBS) 
endif

ifeq ($(ME_COM_HTTP),1)
#
#   libhttp
#
DEPS_31 += $(BUILD)/bin/libmpr.dylib
ifeq ($(ME_COM_PCRE),1)
    DEPS_31 += $(BUILD)/bin/libpcre.dylib
endif
DEPS_31 += $(BUILD)/inc/http.h
DEPS_31 += $(BUILD)/obj/httpLib.o

ifeq ($(ME_COM_PCRE),1)
    LIBS_31 += -lpcre
endif
LIBS_31 += -lmpr
ifeq ($(ME_COM_EST),1)
    LIBS_31 += -lestssl
endif
ifeq ($(ME_COM_EST),1)
    LIBS_31 += -lest
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_31 += -lopenssl
    LIBPATHS_31 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_31 += -lssl
    LIBPATHS_31 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_31 += -lcrypto
    LIBPATHS_31 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/libhttp.dylib: $(DEPS_31)
	@echo '      [Link] $(BUILD)/bin/libhttp.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libhttp.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)  -install_name @rpath/libhttp.dylib -compatibility_version 0.5 -current_version 0.5 "$(BUILD)/obj/httpLib.o" $(LIBPATHS_31) $(LIBS_31) $(LIBS_31) $(LIBS) 
endif

ifeq ($(ME_COM_ZLIB),1)
#
#   libzlib
#
DEPS_32 += $(BUILD)/inc/zlib.h
DEPS_32 += $(BUILD)/obj/zlib.o

$(BUILD)/bin/libzlib.dylib: $(DEPS_32)
	@echo '      [Link] $(BUILD)/bin/libzlib.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libzlib.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS) -install_name @rpath/libzlib.dylib -compatibility_version 0.5 -current_version 0.5 "$(BUILD)/obj/zlib.o" $(LIBS) 
endif

ifeq ($(ME_COM_EJS),1)
#
#   libejs
#
ifeq ($(ME_COM_HTTP),1)
    DEPS_33 += $(BUILD)/bin/libhttp.dylib
endif
ifeq ($(ME_COM_PCRE),1)
    DEPS_33 += $(BUILD)/bin/libpcre.dylib
endif
DEPS_33 += $(BUILD)/bin/libmpr.dylib
ifeq ($(ME_COM_ZLIB),1)
    DEPS_33 += $(BUILD)/bin/libzlib.dylib
endif
DEPS_33 += $(BUILD)/inc/ejs.h
DEPS_33 += $(BUILD)/inc/ejs.slots.h
DEPS_33 += $(BUILD)/inc/ejsByteGoto.h
DEPS_33 += $(BUILD)/obj/ejsLib.o

ifeq ($(ME_COM_ZLIB),1)
    LIBS_33 += -lzlib
endif
ifeq ($(ME_COM_HTTP),1)
    LIBS_33 += -lhttp
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_33 += -lpcre
endif
LIBS_33 += -lmpr
ifeq ($(ME_COM_EST),1)
    LIBS_33 += -lestssl
endif
ifeq ($(ME_COM_EST),1)
    LIBS_33 += -lest
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_33 += -lopenssl
    LIBPATHS_33 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_33 += -lssl
    LIBPATHS_33 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_33 += -lcrypto
    LIBPATHS_33 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/libejs.dylib: $(DEPS_33)
	@echo '      [Link] $(BUILD)/bin/libejs.dylib'
	$(CC) -dynamiclib -o $(BUILD)/bin/libejs.dylib -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)  -install_name @rpath/libejs.dylib -compatibility_version 0.5 -current_version 0.5 "$(BUILD)/obj/ejsLib.o" $(LIBPATHS_33) $(LIBS_33) $(LIBS_33) $(LIBS) 
endif

ifeq ($(ME_COM_EJS),1)
#
#   ejsc
#
DEPS_34 += $(BUILD)/bin/libejs.dylib
DEPS_34 += $(BUILD)/obj/ejsc.o

LIBS_34 += -lejs
ifeq ($(ME_COM_ZLIB),1)
    LIBS_34 += -lzlib
endif
ifeq ($(ME_COM_HTTP),1)
    LIBS_34 += -lhttp
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_34 += -lpcre
endif
LIBS_34 += -lmpr
ifeq ($(ME_COM_EST),1)
    LIBS_34 += -lestssl
endif
ifeq ($(ME_COM_EST),1)
    LIBS_34 += -lest
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_34 += -lopenssl
    LIBPATHS_34 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_34 += -lssl
    LIBPATHS_34 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_34 += -lcrypto
    LIBPATHS_34 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/ejsc: $(DEPS_34)
	@echo '      [Link] $(BUILD)/bin/ejsc'
	$(CC) -o $(BUILD)/bin/ejsc -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)  "$(BUILD)/obj/ejsc.o" $(LIBPATHS_34) $(LIBS_34) $(LIBS_34) $(LIBS) 
endif

ifeq ($(ME_COM_EJS),1)
#
#   ejs.mod
#
DEPS_35 += src/ejs/ejs.es
DEPS_35 += $(BUILD)/bin/ejsc

$(BUILD)/bin/ejs.mod: $(DEPS_35)
	( \
	cd src/ejs; \
	echo '   [Compile] ejs.mod' ; \
	"../../$(BUILD)/bin/ejsc" --out "../../$(BUILD)/bin/ejs.mod" --optimize 9 --bind --require null ejs.es ; \
	)
endif

ifeq ($(ME_COM_EJS),1)
#
#   ejscmd
#
DEPS_36 += $(BUILD)/bin/libejs.dylib
DEPS_36 += $(BUILD)/obj/ejs.o

LIBS_36 += -lejs
ifeq ($(ME_COM_ZLIB),1)
    LIBS_36 += -lzlib
endif
ifeq ($(ME_COM_HTTP),1)
    LIBS_36 += -lhttp
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_36 += -lpcre
endif
LIBS_36 += -lmpr
ifeq ($(ME_COM_EST),1)
    LIBS_36 += -lestssl
endif
ifeq ($(ME_COM_EST),1)
    LIBS_36 += -lest
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_36 += -lopenssl
    LIBPATHS_36 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_36 += -lssl
    LIBPATHS_36 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_36 += -lcrypto
    LIBPATHS_36 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/ejs: $(DEPS_36)
	@echo '      [Link] $(BUILD)/bin/ejs'
	$(CC) -o $(BUILD)/bin/ejs -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)  "$(BUILD)/obj/ejs.o" $(LIBPATHS_36) $(LIBS_36) $(LIBS_36) $(LIBS) -ledit 
endif

#
#   expansive.mod
#
DEPS_37 += src/expansive.es
DEPS_37 += src/ExpParser.es
DEPS_37 += paks/ejs-version/Version.es
ifeq ($(ME_COM_EJS),1)
    DEPS_37 += $(BUILD)/bin/ejs.mod
endif

$(BUILD)/bin/expansive.mod: $(DEPS_37)
	echo '   [Compile] expansive.mod' ; \
	"./$(BUILD)/bin/ejsc" --debug --out "./$(BUILD)/bin/expansive.mod" --optimize 9 src/expansive.es src/ExpParser.es paks/ejs-version/Version.es

#
#   expansive
#
DEPS_38 += $(BUILD)/bin/libmpr.dylib
ifeq ($(ME_COM_HTTP),1)
    DEPS_38 += $(BUILD)/bin/libhttp.dylib
endif
ifeq ($(ME_COM_EJS),1)
    DEPS_38 += $(BUILD)/bin/libejs.dylib
endif
DEPS_38 += $(BUILD)/bin/expansive.mod
DEPS_38 += $(BUILD)/obj/expansive.o
DEPS_38 += $(BUILD)/obj/expParser.o

ifeq ($(ME_COM_EJS),1)
    LIBS_38 += -lejs
endif
ifeq ($(ME_COM_HTTP),1)
    LIBS_38 += -lhttp
endif
LIBS_38 += -lmpr
ifeq ($(ME_COM_EST),1)
    LIBS_38 += -lestssl
endif
ifeq ($(ME_COM_EST),1)
    LIBS_38 += -lest
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_38 += -lopenssl
    LIBPATHS_38 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_38 += -lssl
    LIBPATHS_38 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_38 += -lcrypto
    LIBPATHS_38 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_PCRE),1)
    LIBS_38 += -lpcre
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_38 += -lzlib
endif

$(BUILD)/bin/expansive: $(DEPS_38)
	@echo '      [Link] $(BUILD)/bin/expansive'
	$(CC) -o $(BUILD)/bin/expansive -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)  "$(BUILD)/obj/expansive.o" "$(BUILD)/obj/expParser.o" $(LIBPATHS_38) $(LIBS_38) $(LIBS_38) $(LIBS) 

ifeq ($(ME_COM_HTTP),1)
#
#   httpcmd
#
DEPS_39 += $(BUILD)/bin/libhttp.dylib
DEPS_39 += $(BUILD)/obj/http.o

LIBS_39 += -lhttp
ifeq ($(ME_COM_PCRE),1)
    LIBS_39 += -lpcre
endif
LIBS_39 += -lmpr
ifeq ($(ME_COM_EST),1)
    LIBS_39 += -lestssl
endif
ifeq ($(ME_COM_EST),1)
    LIBS_39 += -lest
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_39 += -lopenssl
    LIBPATHS_39 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_39 += -lssl
    LIBPATHS_39 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_39 += -lcrypto
    LIBPATHS_39 += -L"$(ME_COM_OPENSSL_PATH)"
endif

$(BUILD)/bin/http: $(DEPS_39)
	@echo '      [Link] $(BUILD)/bin/http'
	$(CC) -o $(BUILD)/bin/http -arch $(CC_ARCH) $(LDFLAGS) $(LIBPATHS)  "$(BUILD)/obj/http.o" $(LIBPATHS_39) $(LIBS_39) $(LIBS_39) $(LIBS) 
endif

#
#   roots.crt
#
DEPS_40 += src/certs/roots.crt

$(BUILD)/bin/roots.crt: $(DEPS_40)
	@echo '      [Copy] $(BUILD)/bin/roots.crt'
	mkdir -p "$(BUILD)/bin"
	cp src/certs/roots.crt $(BUILD)/bin/roots.crt

#
#   sample
#
DEPS_41 += src/sample.json

$(BUILD)/bin/sample.json: $(DEPS_41)
	@echo '      [Copy] $(BUILD)/bin/sample.json'
	mkdir -p "$(BUILD)/bin"
	cp src/sample.json $(BUILD)/bin/sample.json

#
#   installPrep
#

installPrep: $(DEPS_42)
	if [ "`id -u`" != 0 ] ; \
	then echo "Must run as root. Rerun with "sudo"" ; \
	exit 255 ; \
	fi

#
#   stop
#

stop: $(DEPS_43)

#
#   installBinary
#

installBinary: $(DEPS_44)
	mkdir -p "$(ME_APP_PREFIX)" ; \
	rm -f "$(ME_APP_PREFIX)/latest" ; \
	ln -s "$(VERSION)" "$(ME_APP_PREFIX)/latest" ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	cp $(BUILD)/bin/expansive $(ME_VAPP_PREFIX)/bin/expansive ; \
	mkdir -p "$(ME_BIN_PREFIX)" ; \
	rm -f "$(ME_BIN_PREFIX)/expansive" ; \
	ln -s "$(ME_VAPP_PREFIX)/bin/expansive" "$(ME_BIN_PREFIX)/expansive" ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	cp $(BUILD)/bin/libejs.dylib $(ME_VAPP_PREFIX)/bin/libejs.dylib ; \
	cp $(BUILD)/bin/libhttp.dylib $(ME_VAPP_PREFIX)/bin/libhttp.dylib ; \
	cp $(BUILD)/bin/libmpr.dylib $(ME_VAPP_PREFIX)/bin/libmpr.dylib ; \
	cp $(BUILD)/bin/libpcre.dylib $(ME_VAPP_PREFIX)/bin/libpcre.dylib ; \
	cp $(BUILD)/bin/libzlib.dylib $(ME_VAPP_PREFIX)/bin/libzlib.dylib ; \
	if [ "$(ME_COM_EST)" = 1 ]; then true ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	cp $(BUILD)/bin/libest.dylib $(ME_VAPP_PREFIX)/bin/libest.dylib ; \
	fi ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	cp src/certs/roots.crt $(ME_VAPP_PREFIX)/bin/roots.crt ; \
	cp $(BUILD)/bin/ejs.mod $(ME_VAPP_PREFIX)/bin/ejs.mod ; \
	cp $(BUILD)/bin/expansive.mod $(ME_VAPP_PREFIX)/bin/expansive.mod ; \
	cp $(BUILD)/bin/sample.json $(ME_VAPP_PREFIX)/bin/sample.json ; \
	mkdir -p "$(ME_VAPP_PREFIX)/doc/man/man1" ; \
	cp doc/contents/man/expansive.1 $(ME_VAPP_PREFIX)/doc/man/man1/expansive.1 ; \
	mkdir -p "$(ME_MAN_PREFIX)/man1" ; \
	rm -f "$(ME_MAN_PREFIX)/man1/expansive.1" ; \
	ln -s "$(ME_VAPP_PREFIX)/doc/man/man1/expansive.1" "$(ME_MAN_PREFIX)/man1/expansive.1"

#
#   start
#

start: $(DEPS_45)

#
#   install
#
DEPS_46 += installPrep
DEPS_46 += stop
DEPS_46 += installBinary
DEPS_46 += start

install: $(DEPS_46)

#
#   uninstall
#
DEPS_47 += stop

uninstall: $(DEPS_47)
	rm -fr "$(ME_VAPP_PREFIX)" ; \
	rm -f "$(ME_APP_PREFIX)/latest" ; \
	rmdir -p "$(ME_APP_PREFIX)" 2>/dev/null ; true

#
#   version
#

version: $(DEPS_48)
	echo $(VERSION)

