#!/usr/bin/bash
sudo gem install nokogiri -- \
    --use-system-libraries \
    --with-iconv-dir=/path/to/dir \
    --with-zlib-dir=/path/to/dir \
    --with-xml2-config=/path/to/xml2-config \
    --with-xslt-config=/path/to/xslt-config