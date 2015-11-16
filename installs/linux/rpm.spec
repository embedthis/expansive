#
#	RPM spec file for ${settings.title}
#
Summary: ${settings.title} -- A static web site generator
Name: ${settings.name}
Version: ${settings.version}
Release: 0
License: Dual GPL/commercial
Group: Development/Other
URL: http://embedthis.com
Distribution: Embedthis
Vendor: Embedthis Software
BuildRoot: ${prefixes.rpm}/BUILDROOT/${settings.name}-${settings.version}.${platform.mappedCpu}
AutoReqProv: no

%description
Expansive is a static web site generator.

%prep

%build

%install
    mkdir -p ${prefixes.rpm}/BUILDROOT/${settings.name}-${settings.version}.${platform.mappedCpu}
    cp -r ${prefixes.content}/* ${prefixes.rpm}/BUILDROOT/${settings.name}-${settings.version}.${platform.mappedCpu}

%clean

%files -f binFiles.txt

%post
if [ -x /usr/bin/chcon ] ; then 
	sestatus | grep enabled >/dev/null 2>&1
	if [ $? = 0 ] ; then
		for f in ${prefixes.vapp}/bin/*.so ; do
			chcon /usr/bin/chcon -t texrel_shlib_t $f
		done
	fi
fi
ldconfig -n ${prefixes.vapp}/bin

%preun
rm -f ${prefixes.app}/latest

%postun

