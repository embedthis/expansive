#
#   expansive-linux-default.mk -- Makefile to build Embedthis Expansive for linux
#

NAME                  := expansive
VERSION               := 0.5.0
PROFILE               ?= default
ARCH                  ?= $(shell uname -m | sed 's/i.86/x86/;s/x86_64/x64/;s/arm.*/arm/;s/mips.*/mips/')
CC_ARCH               ?= $(shell echo $(ARCH) | sed 's/x86/i686/;s/x64/x86_64/')
OS                    ?= linux
CC                    ?= gcc
CONFIG                ?= $(OS)-$(ARCH)-$(PROFILE)
BUILD                 ?= build/$(CONFIG)
LBIN                  ?= $(BUILD)/bin
PATH                  := $(LBIN):$(PATH)

ME_COM_COMPILER       ?= 1
ME_COM_EJS            ?= 1
ME_COM_EST            ?= 0
ME_COM_HTTP           ?= 1
ME_COM_LIB            ?= 1
ME_COM_MPR            ?= 1
ME_COM_OPENSSL        ?= 1
ME_COM_OSDEP          ?= 1
ME_COM_PCRE           ?= 1
ME_COM_SQLITE         ?= 0
ME_COM_SSL            ?= 1
ME_COM_VXWORKS        ?= 0
ME_COM_WINSDK         ?= 1
ME_COM_ZLIB           ?= 1

ME_COM_OPENSSL_PATH   ?= "/usr"

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

CFLAGS                += -fPIC -w
DFLAGS                += -D_REENTRANT -DPIC $(patsubst %,-D%,$(filter ME_%,$(MAKEFLAGS))) -DME_COM_COMPILER=$(ME_COM_COMPILER) -DME_COM_EJS=$(ME_COM_EJS) -DME_COM_EST=$(ME_COM_EST) -DME_COM_HTTP=$(ME_COM_HTTP) -DME_COM_LIB=$(ME_COM_LIB) -DME_COM_MPR=$(ME_COM_MPR) -DME_COM_OPENSSL=$(ME_COM_OPENSSL) -DME_COM_OSDEP=$(ME_COM_OSDEP) -DME_COM_PCRE=$(ME_COM_PCRE) -DME_COM_SQLITE=$(ME_COM_SQLITE) -DME_COM_SSL=$(ME_COM_SSL) -DME_COM_VXWORKS=$(ME_COM_VXWORKS) -DME_COM_WINSDK=$(ME_COM_WINSDK) -DME_COM_ZLIB=$(ME_COM_ZLIB) 
IFLAGS                += "-I$(BUILD)/inc"
LDFLAGS               += '-rdynamic' '-Wl,--enable-new-dtags' '-Wl,-rpath,$$ORIGIN/'
LIBPATHS              += -L$(BUILD)/bin
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
TARGETS               += $(BUILD)/bin/ca.crt
ifeq ($(ME_COM_HTTP),1)
    TARGETS           += $(BUILD)/bin/http
endif
TARGETS               += $(BUILD)/bin/libmprssl.so
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
	@[ ! -f $(BUILD)/inc/me.h ] && cp projects/expansive-linux-default-me.h $(BUILD)/inc/me.h ; true
	@if ! diff $(BUILD)/inc/me.h projects/expansive-linux-default-me.h >/dev/null ; then\
		cp projects/expansive-linux-default-me.h $(BUILD)/inc/me.h  ; \
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
	rm -f "$(BUILD)/obj/mprSsl.o"
	rm -f "$(BUILD)/obj/pcre.o"
	rm -f "$(BUILD)/obj/zlib.o"
	rm -f "$(BUILD)/bin/ejsc"
	rm -f "$(BUILD)/bin/ejs"
	rm -f "$(BUILD)/bin/expansive"
	rm -f "$(BUILD)/bin/ca.crt"
	rm -f "$(BUILD)/bin/http"
	rm -f "$(BUILD)/bin/libejs.so"
	rm -f "$(BUILD)/bin/libhttp.so"
	rm -f "$(BUILD)/bin/libmpr.so"
	rm -f "$(BUILD)/bin/libmprssl.so"
	rm -f "$(BUILD)/bin/libpcre.so"
	rm -f "$(BUILD)/bin/libzlib.so"
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
	$(CC) -c -o $(BUILD)/obj/ejs.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/ejs/ejs.c

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
	$(CC) -c -o $(BUILD)/obj/ejsLib.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/ejs/ejsLib.c

#
#   ejsc.o
#
DEPS_15 += src/ejs/ejs.h

$(BUILD)/obj/ejsc.o: \
    src/ejs/ejsc.c $(DEPS_15)
	@echo '   [Compile] $(BUILD)/obj/ejsc.o'
	$(CC) -c -o $(BUILD)/obj/ejsc.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/ejs/ejsc.c

#
#   expParser.o
#
DEPS_16 += $(BUILD)/inc/ejs.h
DEPS_16 += $(BUILD)/inc/expansive.h

$(BUILD)/obj/expParser.o: \
    src/expParser.c $(DEPS_16)
	@echo '   [Compile] $(BUILD)/obj/expParser.o'
	$(CC) -c -o $(BUILD)/obj/expParser.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/expParser.c

#
#   expansive.o
#
DEPS_17 += $(BUILD)/inc/ejs.h
DEPS_17 += $(BUILD)/inc/expansive.h

$(BUILD)/obj/expansive.o: \
    src/expansive.c $(DEPS_17)
	@echo '   [Compile] $(BUILD)/obj/expansive.o'
	$(CC) -c -o $(BUILD)/obj/expansive.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/expansive.c

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
	$(CC) -c -o $(BUILD)/obj/http.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/http/http.c

#
#   httpLib.o
#
DEPS_20 += src/http/http.h

$(BUILD)/obj/httpLib.o: \
    src/http/httpLib.c $(DEPS_20)
	@echo '   [Compile] $(BUILD)/obj/httpLib.o'
	$(CC) -c -o $(BUILD)/obj/httpLib.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/http/httpLib.c

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
	$(CC) -c -o $(BUILD)/obj/mprLib.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/mpr/mprLib.c

#
#   mprSsl.o
#
DEPS_23 += src/mpr/mpr.h

$(BUILD)/obj/mprSsl.o: \
    src/mpr/mprSsl.c $(DEPS_23)
	@echo '   [Compile] $(BUILD)/obj/mprSsl.o'
	$(CC) -c -o $(BUILD)/obj/mprSsl.o $(CFLAGS) $(DFLAGS) -DME_COM_OPENSSL_PATH="$(ME_COM_OPENSSL_PATH)" $(IFLAGS) "-I$(ME_COM_OPENSSL_PATH)/include" src/mpr/mprSsl.c

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
	$(CC) -c -o $(BUILD)/obj/pcre.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/pcre/pcre.c

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
	$(CC) -c -o $(BUILD)/obj/zlib.o $(CFLAGS) $(DFLAGS) $(IFLAGS) src/zlib/zlib.c

#
#   libmpr
#
DEPS_28 += $(BUILD)/inc/osdep.h
DEPS_28 += $(BUILD)/inc/mpr.h
DEPS_28 += $(BUILD)/obj/mprLib.o

$(BUILD)/bin/libmpr.so: $(DEPS_28)
	@echo '      [Link] $(BUILD)/bin/libmpr.so'
	$(CC) -shared -o $(BUILD)/bin/libmpr.so $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/mprLib.o" $(LIBS) 

ifeq ($(ME_COM_PCRE),1)
#
#   libpcre
#
DEPS_29 += $(BUILD)/inc/pcre.h
DEPS_29 += $(BUILD)/obj/pcre.o

$(BUILD)/bin/libpcre.so: $(DEPS_29)
	@echo '      [Link] $(BUILD)/bin/libpcre.so'
	$(CC) -shared -o $(BUILD)/bin/libpcre.so $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/pcre.o" $(LIBS) 
endif

ifeq ($(ME_COM_HTTP),1)
#
#   libhttp
#
DEPS_30 += $(BUILD)/bin/libmpr.so
ifeq ($(ME_COM_PCRE),1)
    DEPS_30 += $(BUILD)/bin/libpcre.so
endif
DEPS_30 += $(BUILD)/inc/http.h
DEPS_30 += $(BUILD)/obj/httpLib.o

LIBS_30 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_30 += -lpcre
endif

$(BUILD)/bin/libhttp.so: $(DEPS_30)
	@echo '      [Link] $(BUILD)/bin/libhttp.so'
	$(CC) -shared -o $(BUILD)/bin/libhttp.so $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/httpLib.o" $(LIBPATHS_30) $(LIBS_30) $(LIBS_30) $(LIBS) 
endif

ifeq ($(ME_COM_ZLIB),1)
#
#   libzlib
#
DEPS_31 += $(BUILD)/inc/zlib.h
DEPS_31 += $(BUILD)/obj/zlib.o

$(BUILD)/bin/libzlib.so: $(DEPS_31)
	@echo '      [Link] $(BUILD)/bin/libzlib.so'
	$(CC) -shared -o $(BUILD)/bin/libzlib.so $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/zlib.o" $(LIBS) 
endif

ifeq ($(ME_COM_EJS),1)
#
#   libejs
#
ifeq ($(ME_COM_HTTP),1)
    DEPS_32 += $(BUILD)/bin/libhttp.so
endif
ifeq ($(ME_COM_PCRE),1)
    DEPS_32 += $(BUILD)/bin/libpcre.so
endif
DEPS_32 += $(BUILD)/bin/libmpr.so
ifeq ($(ME_COM_ZLIB),1)
    DEPS_32 += $(BUILD)/bin/libzlib.so
endif
DEPS_32 += $(BUILD)/inc/ejs.h
DEPS_32 += $(BUILD)/inc/ejs.slots.h
DEPS_32 += $(BUILD)/inc/ejsByteGoto.h
DEPS_32 += $(BUILD)/obj/ejsLib.o

ifeq ($(ME_COM_HTTP),1)
    LIBS_32 += -lhttp
endif
LIBS_32 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_32 += -lpcre
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_32 += -lzlib
endif

$(BUILD)/bin/libejs.so: $(DEPS_32)
	@echo '      [Link] $(BUILD)/bin/libejs.so'
	$(CC) -shared -o $(BUILD)/bin/libejs.so $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/ejsLib.o" $(LIBPATHS_32) $(LIBS_32) $(LIBS_32) $(LIBS) 
endif

ifeq ($(ME_COM_EJS),1)
#
#   ejsc
#
DEPS_33 += $(BUILD)/bin/libejs.so
DEPS_33 += $(BUILD)/obj/ejsc.o

LIBS_33 += -lejs
ifeq ($(ME_COM_HTTP),1)
    LIBS_33 += -lhttp
endif
LIBS_33 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_33 += -lpcre
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_33 += -lzlib
endif

$(BUILD)/bin/ejsc: $(DEPS_33)
	@echo '      [Link] $(BUILD)/bin/ejsc'
	$(CC) -o $(BUILD)/bin/ejsc $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/ejsc.o" $(LIBPATHS_33) $(LIBS_33) $(LIBS_33) $(LIBS) $(LIBS) 
endif

ifeq ($(ME_COM_EJS),1)
#
#   ejs.mod
#
DEPS_34 += src/ejs/ejs.es
DEPS_34 += $(BUILD)/bin/ejsc

$(BUILD)/bin/ejs.mod: $(DEPS_34)
	( \
	cd src/ejs; \
	echo '   [Compile] ejs.mod' ; \
	../../$(BUILD)/bin/ejsc --out ../../$(BUILD)/bin/ejs.mod --optimize 9 --bind --require null ejs.es ; \
	)
endif

ifeq ($(ME_COM_EJS),1)
#
#   ejscmd
#
DEPS_35 += $(BUILD)/bin/libejs.so
DEPS_35 += $(BUILD)/obj/ejs.o

LIBS_35 += -lejs
ifeq ($(ME_COM_HTTP),1)
    LIBS_35 += -lhttp
endif
LIBS_35 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_35 += -lpcre
endif
ifeq ($(ME_COM_ZLIB),1)
    LIBS_35 += -lzlib
endif

$(BUILD)/bin/ejs: $(DEPS_35)
	@echo '      [Link] $(BUILD)/bin/ejs'
	$(CC) -o $(BUILD)/bin/ejs $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/ejs.o" $(LIBPATHS_35) $(LIBS_35) $(LIBS_35) $(LIBS) $(LIBS) 
endif

#
#   expansive.mod
#
DEPS_36 += src/expansive.es
DEPS_36 += src/ExpParser.es
DEPS_36 += paks/ejs-version/Version.es
ifeq ($(ME_COM_EJS),1)
    DEPS_36 += $(BUILD)/bin/ejs.mod
endif

$(BUILD)/bin/expansive.mod: $(DEPS_36)
	echo '   [Compile] expansive.mod' ; \
	./$(BUILD)/bin/ejsc --debug --out ./$(BUILD)/bin/expansive.mod --optimize 9 src/expansive.es src/ExpParser.es paks/ejs-version/Version.es

#
#   expansive
#
DEPS_37 += $(BUILD)/bin/libmpr.so
ifeq ($(ME_COM_HTTP),1)
    DEPS_37 += $(BUILD)/bin/libhttp.so
endif
ifeq ($(ME_COM_EJS),1)
    DEPS_37 += $(BUILD)/bin/libejs.so
endif
DEPS_37 += $(BUILD)/bin/expansive.mod
DEPS_37 += $(BUILD)/obj/expansive.o
DEPS_37 += $(BUILD)/obj/expParser.o

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

$(BUILD)/bin/expansive: $(DEPS_37)
	@echo '      [Link] $(BUILD)/bin/expansive'
	$(CC) -o $(BUILD)/bin/expansive $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/expansive.o" "$(BUILD)/obj/expParser.o" $(LIBPATHS_37) $(LIBS_37) $(LIBS_37) $(LIBS) $(LIBS) 

#
#   http-ca-crt
#
DEPS_38 += src/http/ca.crt

$(BUILD)/bin/ca.crt: $(DEPS_38)
	@echo '      [Copy] $(BUILD)/bin/ca.crt'
	mkdir -p "$(BUILD)/bin"
	cp src/http/ca.crt $(BUILD)/bin/ca.crt

ifeq ($(ME_COM_HTTP),1)
#
#   httpcmd
#
DEPS_39 += $(BUILD)/bin/libhttp.so
DEPS_39 += $(BUILD)/obj/http.o

LIBS_39 += -lhttp
LIBS_39 += -lmpr
ifeq ($(ME_COM_PCRE),1)
    LIBS_39 += -lpcre
endif

$(BUILD)/bin/http: $(DEPS_39)
	@echo '      [Link] $(BUILD)/bin/http'
	$(CC) -o $(BUILD)/bin/http $(LDFLAGS) $(LIBPATHS) "$(BUILD)/obj/http.o" $(LIBPATHS_39) $(LIBS_39) $(LIBS_39) $(LIBS) $(LIBS) 
endif

#
#   libmprssl
#
DEPS_40 += $(BUILD)/bin/libmpr.so
DEPS_40 += $(BUILD)/obj/mprSsl.o

LIBS_40 += -lmpr
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_40 += -lssl
    LIBPATHS_40 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_40 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_OPENSSL),1)
    LIBS_40 += -lcrypto
    LIBPATHS_40 += -L"$(ME_COM_OPENSSL_PATH)/lib"
    LIBPATHS_40 += -L"$(ME_COM_OPENSSL_PATH)"
endif
ifeq ($(ME_COM_EST),1)
    LIBS_40 += -lest
endif

$(BUILD)/bin/libmprssl.so: $(DEPS_40)
	@echo '      [Link] $(BUILD)/bin/libmprssl.so'
	$(CC) -shared -o $(BUILD)/bin/libmprssl.so $(LDFLAGS) $(LIBPATHS)   "$(BUILD)/obj/mprSsl.o" $(LIBPATHS_40) $(LIBS_40) $(LIBS_40) $(LIBS) 

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
	ln -s "0.5.0" "$(ME_APP_PREFIX)/latest" ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	cp $(BUILD)/bin/expansive $(ME_VAPP_PREFIX)/bin/expansive ; \
	mkdir -p "$(ME_BIN_PREFIX)" ; \
	rm -f "$(ME_BIN_PREFIX)/expansive" ; \
	ln -s "$(ME_VAPP_PREFIX)/bin/expansive" "$(ME_BIN_PREFIX)/expansive" ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	cp $(BUILD)/bin/libejs.so $(ME_VAPP_PREFIX)/bin/libejs.so ; \
	cp $(BUILD)/bin/libhttp.so $(ME_VAPP_PREFIX)/bin/libhttp.so ; \
	cp $(BUILD)/bin/libmpr.so $(ME_VAPP_PREFIX)/bin/libmpr.so ; \
	cp $(BUILD)/bin/libmprssl.so $(ME_VAPP_PREFIX)/bin/libmprssl.so ; \
	cp $(BUILD)/bin/libpcre.so $(ME_VAPP_PREFIX)/bin/libpcre.so ; \
	cp $(BUILD)/bin/libzlib.so $(ME_VAPP_PREFIX)/bin/libzlib.so ; \
	if [ "$(ME_COM_EST)" = 1 ]; then true ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	cp $(BUILD)/bin/libest.so $(ME_VAPP_PREFIX)/bin/libest.so ; \
	fi ; \
	mkdir -p "$(ME_VAPP_PREFIX)/bin" ; \
	cp $(BUILD)/bin/ca.crt $(ME_VAPP_PREFIX)/bin/ca.crt ; \
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
	echo 0.5.0

